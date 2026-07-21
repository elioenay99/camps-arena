import { sniffTipoImagem } from "@/lib/evidence"
import { ESCUDOS_BUCKET } from "@/lib/escudos"
import { env } from "@/lib/env"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Escudo PERSONALIZADO por liga no bucket `escudos` (change
 * escudo-personalizado-liga).
 *
 * Segundo prefixo do MESMO bucket: `custom/<competitor_id>/<uuid>.<ext>`. Não
 * toca `src/lib/escudos.ts`, que segue dono do caminho determinístico do catálogo
 * (`<external_id>.png`, compartilhado, write-once, imutável).
 *
 * Nome NOVO a cada gravação (nunca `upsert`): o bucket serve com cache de 1 ano,
 * então reusar o nome deixaria o escudo antigo preso no CDN e nos aparelhos. Nome
 * novo é cache-busting por construção.
 */
const PREFIXO = "custom"

/**
 * Allowlist do SERVIDOR — espelha o `allowed_mime_types` do bucket
 * (`['image/png','image/webp']`). JPEG fica de fora de propósito: a folha client
 * reduz tudo em canvas e entrega PNG/WEBP, então aceitar JPEG só ampliaria a
 * superfície (e o EXIF já morre no canvas). SVG fora sempre: SVG-XSS armazenado
 * servido pelo host do projeto.
 */
const EXTENSAO_POR_TIPO: Record<string, { mime: string; ext: string }> = {
  "image/png": { mime: "image/png", ext: "png" },
  "image/webp": { mime: "image/webp", ext: "webp" },
}

/** Espelha o `file_size_limit` de 256KB do bucket (defesa em profundidade). */
const MAX_BYTES = 256 * 1024
/** Um escudo custom é imutável pela chave (uuid novo a cada envio) → cache longo. */
const CACHE_CONTROL = "31536000"

export type EscudoCustomUpload = { ok: true; url: string } | { ok: false; error: string }

/** Prefixo público do bucket — base para montar e para desmontar a URL. */
function basePublica(): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")
  return `${base}/storage/v1/object/public/${ESCUDOS_BUCKET}/`
}

/**
 * Valida (no SERVIDOR) e sobe o escudo personalizado do competidor. A validação
 * vai além do MIME declarado: confere a assinatura REAL dos bytes contra o
 * allowlist E contra o tipo declarado. O `contentType` gravado deriva do tipo
 * DETECTADO — o cliente não é fonte da verdade.
 *
 * Devolve a URL PÚBLICA final, que é o que vai para `league_competitors.escudo_url`
 * (e precisa casar a CHECK `league_competitors_escudo_url_dominio`).
 */
export async function subirEscudoCustom(
  supabase: ServerClient,
  competitorId: string,
  file: File
): Promise<EscudoCustomUpload> {
  if (file.size === 0) return { ok: false, error: "Selecione uma imagem." }
  if (!EXTENSAO_POR_TIPO[file.type]) {
    return { ok: false, error: "Use uma imagem PNG ou WEBP." }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "A imagem deve ter no máximo 256KB." }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const tipo = sniffTipoImagem(bytes)
  // `sniffTipoImagem` também detecta jpeg; aqui ele cai fora pelo allowlist.
  const info = tipo ? EXTENSAO_POR_TIPO[`image/${tipo}`] : undefined
  if (!info) {
    return { ok: false, error: "O arquivo não é uma imagem PNG ou WEBP válida." }
  }
  if (info.mime !== file.type) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde ao tipo informado." }
  }

  // O path é a CHAVE DE AUTORIZAÇÃO: a policy de storage lê o competitor_id daqui
  // (public.pode_gerir_escudo_custom). Precisa ser uuid em hex minúsculo.
  const path = `${PREFIXO}/${competitorId}/${crypto.randomUUID()}.${info.ext}`
  const { error } = await supabase.storage
    .from(ESCUDOS_BUCKET)
    .upload(path, bytes, {
      contentType: info.mime,
      cacheControl: CACHE_CONTROL,
      upsert: false,
    })
  if (error) {
    return { ok: false, error: "Não foi possível enviar o escudo. Tente novamente." }
  }

  return { ok: true, url: `${basePublica()}${path}` }
}

/**
 * Remove um escudo personalizado a partir da URL pública (best-effort: troca de
 * escudo, remoção do override, ou rollback de upload órfão quando a RLS barra o
 * UPDATE). Ignora URL que não seja deste bucket sob o prefixo `custom/` — nunca
 * pode alcançar o catálogo global (`<external_id>.png`), que é write-once.
 */
export async function removerEscudoCustom(
  supabase: ServerClient,
  url: string | null | undefined
): Promise<void> {
  if (!url) return
  const base = basePublica()
  if (!url.startsWith(base)) return
  const path = url.slice(base.length)
  if (!path.startsWith(`${PREFIXO}/`)) return
  await supabase.storage.from(ESCUDOS_BUCKET).remove([path])
}
