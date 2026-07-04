import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Bucket PÚBLICO `escudos`: cache self-hostado dos escudos de clube. Corta o
 * hotlink do CDN da API-Football (`media.api-sports.io`) em todo render —
 * o navegador passa a buscar a imagem do NOSSO Storage, não de terceiro.
 *
 * Chave determinística por `external_id` (`escudos/<external_id>.png`): a
 * mesma imagem é compartilhada por todos, gravada uma vez. Leitura por URL
 * pública (o bucket é `public=true`); escrita via RLS de `storage.objects`
 * (INSERT liberado a autenticados — mesmo nível de confiança de inserir em
 * `public.teams`). Ver `supabase/schema.sql`.
 */
export const ESCUDOS_BUCKET = "escudos"

/** Timeout do download do escudo de origem (espelha `searchTeams`). */
const DOWNLOAD_TIMEOUT_MS = 8000
/** Escudo por `external_id` é imutável → cache longo (1 ano). */
const CACHE_CONTROL = "31536000"
/**
 * Teto do payload baixado (espelha o `file_size_limit` de 256KB do bucket).
 * Barra buffering de resposta gigante: quando a resposta traz `Content-Length`,
 * abortamos ANTES do `arrayBuffer()`; sem esse header o buffer ainda ocorre, mas
 * a origem é o CDN confiável (escudo real ~10-40KB) e o check pós-buffer
 * (cinto-e-suspensório) barra o upload de algo maior.
 */
const MAX_BYTES = 256 * 1024
/**
 * Escudos da API-Football são sempre PNG (`/football/teams/<id>.png`); a chave
 * é `.png`. Gravamos com este content-type fixo (o Storage serve por ele).
 */
const CONTENT_TYPE = "image/png"

/**
 * Rehospeda o escudo do clube no Storage próprio e devolve a URL FINAL a gravar
 * em `teams.escudo_url`.
 *
 * Best-effort e NON-FATAL: qualquer falha (download indisponível/timeout,
 * resposta não-imagem, payload grande demais, erro de upload) devolve
 * `origemUrl` INALTERADA — preserva o comportamento atual (grava a URL da
 * api-sports, que a CHECK de transição ainda aceita). Nunca lança.
 *
 * Determinístico por `externalId` → idempotente: rodar de novo regrava o mesmo
 * objeto (`upsert: true`).
 *
 * @param supabase Client do Supabase (server: anon/authenticated; backfill:
 *   service_role — ambos têm `.storage`).
 * @param externalId Identificador do clube (nome do arquivo no bucket).
 * @param origemUrl URL pública da imagem de origem (ex.: CDN da api-sports).
 * @returns URL pública do Storage em caso de sucesso; senão `origemUrl`.
 */
export async function rehospedarEscudo(
  supabase: ServerClient,
  externalId: string,
  origemUrl: string
): Promise<string> {
  let bytes: ArrayBuffer
  try {
    const resposta = await fetch(origemUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!resposta.ok) return origemUrl
    // Confere que é imagem antes de gastar memória/upload (defensivo).
    const tipo = resposta.headers.get("content-type")
    if (tipo && !tipo.startsWith("image/")) return origemUrl
    // Pré-check por Content-Length (quando presente): aborta ANTES de bufferizar
    // um payload gigante.
    const declarado = Number(resposta.headers.get("content-length"))
    if (declarado && declarado > MAX_BYTES) return origemUrl
    bytes = await resposta.arrayBuffer()
  } catch {
    // Rede/timeout/abort — degrade gracioso.
    return origemUrl
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return origemUrl

  const caminho = `${externalId}.png`
  const { error } = await supabase.storage.from(ESCUDOS_BUCKET).upload(caminho, bytes, {
    contentType: CONTENT_TYPE,
    cacheControl: CACHE_CONTROL,
    upsert: true,
  })
  if (error) return origemUrl

  return supabase.storage.from(ESCUDOS_BUCKET).getPublicUrl(caminho).data.publicUrl
}
