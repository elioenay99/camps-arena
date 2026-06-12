import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Solicitação de W.O. pendente (visível ao dono e ao solicitante via RLS). */
export interface SolicitacaoWO {
  id: string
  matchId: string
  /** Clube que solicitou o W.O. (o vencedor pretendido). */
  clubeSolicitante: string
  /** Rodada da partida (rótulo); null em avulso (que não recebe W.O.). */
  rodada: number | null
}

/**
 * Solicitações de W.O. PENDENTES do torneio. A RLS de `match_wo_requests`
 * decide o que cada um vê: o DONO vê todas as do seu torneio; o técnico
 * solicitante vê a própria. A página gateia o console de resolução ao dono.
 * Filtro por torneio via embed inner em matches (a tabela de requests não tem
 * tournament_id direto).
 */
export async function getSolicitacoesWO(
  tournamentId: string
): Promise<SolicitacaoWO[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("match_wo_requests")
    .select(
      `id, match_id,
       solicitante:tournament_slots!match_wo_requests_solicitante_slot_fkey (
         rotulo,
         team:teams!tournament_slots_team_id_fkey ( nome )
       ),
       match:matches!match_wo_requests_match_id_fkey!inner ( rodada, tournament_id )`
    )
    .eq("status", "pendente")
    .eq("match.tournament_id", tournamentId)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Falha ao carregar as solicitações de W.O.: ${error.message}`)
  }

  const linhas = (data ?? []) as unknown as Array<{
    id: string
    match_id: string
    solicitante: { rotulo: string | null; team: { nome: string | null } | null } | null
    match: { rodada: number | null } | null
  }>

  return linhas.map((l) => ({
    id: l.id,
    matchId: l.match_id,
    clubeSolicitante:
      l.solicitante?.team?.nome?.trim() || l.solicitante?.rotulo?.trim() || "Competidor",
    rodada: l.match?.rodada ?? null,
  }))
}
