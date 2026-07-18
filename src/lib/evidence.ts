import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Evidência de resultado (change add-proposta-resultado-foto). Bucket PRIVADO:
 * a leitura passa pela rota autenticada (policy SELECT por arbitrar/jogador), não
 * por URL pública. O upload é feito SEMPRE na Server Action (não no client), que
 * CONSTRÓI o path `<uid>/<matchId>/<rand>.<ext>` — o `matchId` do path é o da
 * partida da proposta, então não há como forjar evidência de outra partida.
 */
export const EVIDENCE_BUCKET = "match_evidence"

const MAX_BYTES = 5 * 1024 * 1024 // 5MB (espelha file_size_limit do bucket)
const EXTENSAO_POR_TIPO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export type TipoImagem = "png" | "jpeg" | "webp"

/** MIME e extensão canônicos por tipo DETECTADO (fonte confiável, não o cliente). */
const INFO_POR_TIPO: Record<TipoImagem, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  webp: { mime: "image/webp", ext: "webp" },
}

/**
 * Detecta o tipo de imagem pela ASSINATURA real dos bytes (magic bytes), não pelo
 * MIME declarado (falsificável). Retorna `null` fora do allowlist png/jpeg/webp.
 * Pura e sem I/O — testável isolada.
 */
export function sniffTipoImagem(bytes: Uint8Array): TipoImagem | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) return "png"

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg"
  }

  // WEBP: "RIFF" (52 49 46 46) em 0-3 e "WEBP" (57 45 42 50) em 8-11
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }

  return null
}

/**
 * Remove os segmentos APP1 (marcador FF E1 — EXIF/XMP, onde vive o GPS) de um
 * stream JPEG, em puro-JS e SEM re-encodar (não altera pixels). Preserva o SOI, os
 * demais segmentos e os dados de scan (a partir de FF DA/SOS). Entrada não-JPEG
 * volta intacta. Pura e sem I/O.
 */
export function removerExifJpeg(bytes: Uint8Array): Uint8Array {
  // Só mexe em JPEG (começa por SOI = FF D8); qualquer outra coisa volta intacta.
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes

  const manter: Array<[number, number]> = [[0, 2]] // SOI
  const n = bytes.length
  let i = 2
  let removeu = false

  while (i + 1 < n) {
    if (bytes[i] !== 0xff) {
      // Fora de sincronia (JPEG malformado): preserva o restante como está.
      manter.push([i, n])
      break
    }
    const marcador = bytes[i + 1]

    // Bytes de preenchimento (0xFF repetido) antes de um marcador válido.
    if (marcador === 0xff) {
      i++
      continue
    }
    // EOI (D9) ou início do scan (DA/SOS): daqui pra frente são dados de imagem
    // sem campo de tamanho — preserva tudo até o fim.
    if (marcador === 0xd9 || marcador === 0xda) {
      manter.push([i, n])
      break
    }
    // Marcadores standalone, sem segmento de tamanho: TEM (01) e RSTn (D0..D7).
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) {
      manter.push([i, i + 2])
      i += 2
      continue
    }
    // Demais marcadores carregam segmento: [FF][marcador][len_hi][len_lo][...dados].
    // O tamanho (big-endian) inclui os 2 bytes do próprio campo de tamanho.
    if (i + 3 >= n) {
      manter.push([i, n]) // campo de tamanho truncado
      break
    }
    const tamanho = (bytes[i + 2] << 8) | bytes[i + 3]
    const fim = i + 2 + tamanho
    if (fim > n) {
      manter.push([i, n]) // segmento truncado
      break
    }
    if (marcador === 0xe1) {
      removeu = true // APP1 (EXIF/XMP) — descarta o segmento inteiro
    } else {
      manter.push([i, fim])
    }
    i = fim
  }

  if (!removeu) return bytes

  const total = manter.reduce((soma, [a, b]) => soma + (b - a), 0)
  const saida = new Uint8Array(total)
  let off = 0
  for (const [a, b] of manter) {
    saida.set(bytes.subarray(a, b), off)
    off += b - a
  }
  return saida
}

export type EvidenciaUpload = { ok: true; path: string } | { ok: false; error: string }

/**
 * Valida (no SERVIDOR) e sobe a foto na pasta do usuário. A validação vai além do
 * MIME declarado: confere a assinatura REAL dos bytes (magic bytes) contra o
 * allowlist e contra o tipo declarado, e remove o EXIF de JPEG (privacidade)
 * antes de persistir. O `contentType` enviado deriva do tipo DETECTADO.
 */
export async function subirEvidencia(
  supabase: ServerClient,
  uid: string,
  matchId: string,
  file: File
): Promise<EvidenciaUpload> {
  if (file.size === 0) return { ok: false, error: "Selecione uma imagem." }
  if (!EXTENSAO_POR_TIPO[file.type]) {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "A imagem deve ter no máximo 5MB." }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const tipo = sniffTipoImagem(bytes)
  if (!tipo) {
    return { ok: false, error: "O arquivo não é uma imagem PNG, JPG ou WEBP válida." }
  }
  const info = INFO_POR_TIPO[tipo]
  // O MIME declarado pelo cliente precisa bater com o conteúdo real.
  if (info.mime !== file.type) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde ao tipo informado." }
  }

  // Privacidade: JPEG carrega EXIF (GPS). PNG/WEBP sobem sem strip (escopo).
  const corpo = tipo === "jpeg" ? removerExifJpeg(bytes) : bytes

  const path = `${uid}/${matchId}/${crypto.randomUUID()}.${info.ext}`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    // contentType deriva do tipo DETECTADO (confiável), não do MIME do cliente.
    .upload(path, corpo, { contentType: info.mime, upsert: false })
  if (error) {
    return { ok: false, error: "Não foi possível enviar a foto. Tente novamente." }
  }
  return { ok: true, path }
}

/** Remove um arquivo de evidência (best-effort: rollback de foto órfã / reenvio). */
export async function removerEvidencia(supabase: ServerClient, path: string): Promise<void> {
  await supabase.storage.from(EVIDENCE_BUCKET).remove([path])
}
