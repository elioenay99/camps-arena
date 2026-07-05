import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um rival possível para o picker de confronto (só identidade, sem placar). */
export interface RivalCompetidor {
  id: string
  nome: string
  escudoUrl: string | null
}

/**
 * Rivais possíveis de um competidor: os demais `league_competitors` que
 * compartilham a MESMA competição/pirâmide (compartilhar a competição É
 * compartilhar temporada(s)). `.neq("id", competitorId)` explícito, deduplicados
 * por id (a query já é única por competidor), ordenados por nome. A RLS de
 * `league_competitors` filtra a visibilidade. Só identidade — o confronto em si é
 * carregado sob demanda (server action) ao escolher o rival.
 *
 * Degrada para `[]` em erro de IO.
 */
export async function getRivaisDoCompetidor(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<RivalCompetidor[]> {
  const { data: atual, error: atualErr } = await supabase
    .from("league_competitors")
    .select("competition_id")
    .eq("id", competitorId)
    .maybeSingle()
  if (atualErr || !atual?.competition_id) return []

  const { data: rivais, error: rivaisErr } = await supabase
    .from("league_competitors")
    .select("id, rotulo, team:teams ( nome, escudo_url )")
    .eq("competition_id", atual.competition_id)
    .neq("id", competitorId)
  if (rivaisErr || !rivais) return []

  return rivais
    .map((r) => {
      const team = r.team as unknown as {
        nome: string | null
        escudo_url: string | null
      } | null
      const nome = r.rotulo?.trim() || team?.nome?.trim() || "Competidor"
      return { id: r.id, nome, escudoUrl: team?.escudo_url ?? null }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))
}
