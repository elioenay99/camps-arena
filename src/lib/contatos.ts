import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Mapa `id → celular` dos contatos VISÍVEIS ao usuário logado.
 *
 * O `celular` (PII) não vem mais embutido nos embeds de `users`: a coluna perdeu
 * o grant de SELECT (ver `supabase/schema.sql`, bloco "PII: o celular é restrito
 * a co-participantes"). A RPC `celulares_de_contato` (SECURITY DEFINER) é o ÚNICO
 * caminho de leitura e só devolve o número de co-participantes (ou do próprio
 * usuário). Ids sem retorno ficam FORA do mapa → o chamador materializa `?? null`.
 *
 * Falha da RPC degrada para mapa vazio (o atalho de convocação some, mas a página
 * não quebra): o telefone é conveniência, não dado crítico de render.
 */
export async function carregarCelulares(
  supabase: ServerClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, string | null>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))]
  if (unicos.length === 0) return new Map()

  const { data, error } = await supabase.rpc("celulares_de_contato", {
    p_user_ids: unicos,
  })
  if (error || !data) {
    // Degrada para vazio (some o atalho, não vaza). Loga p/ distinguir falha
    // real da RPC de "sem co-participante" (caso normal, sem erro).
    if (error) console.error("carregarCelulares falhou", error.code ?? error.message)
    return new Map()
  }

  return new Map(data.map((r) => [r.user_id, r.celular]))
}
