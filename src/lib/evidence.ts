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

export type EvidenciaUpload = { ok: true; path: string } | { ok: false; error: string }

/** Valida (tipo/tamanho no SERVIDOR) e sobe a foto na pasta do usuário. */
export async function subirEvidencia(
  supabase: ServerClient,
  uid: string,
  matchId: string,
  file: File
): Promise<EvidenciaUpload> {
  if (file.size === 0) return { ok: false, error: "Selecione uma imagem." }
  const ext = EXTENSAO_POR_TIPO[file.type]
  if (!ext) return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." }
  if (file.size > MAX_BYTES) return { ok: false, error: "A imagem deve ter no máximo 5MB." }

  const path = `${uid}/${matchId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) {
    return { ok: false, error: "Não foi possível enviar a foto. Tente novamente." }
  }
  return { ok: true, path }
}

/** Remove um arquivo de evidência (best-effort: rollback de foto órfã / reenvio). */
export async function removerEvidencia(supabase: ServerClient, path: string): Promise<void> {
  await supabase.storage.from(EVIDENCE_BUCKET).remove([path])
}
