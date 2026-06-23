import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Uma proposta de placar pendente, pronta para a UI de aprovação. */
export interface PropostaPendente {
  id: string
  placar_1: number
  placar_2: number
  lado1: string
  lado2: string
}

type LadoEmbed = { rotulo: string | null; clube: { nome: string | null } | null } | null

function nomeLado(v: LadoEmbed): string {
  return v?.clube?.nome?.trim() || v?.rotulo?.trim() || "?"
}

/**
 * Propostas de placar PENDENTES de um torneio, para o aprovador (change
 * add-proposta-resultado-foto). A RLS de `match_score_proposals` só entrega as
 * linhas a quem ARBITRA o torneio (ou ao jogador da partida); a página só
 * renderiza esta seção para quem arbitra, então aqui é o conjunto do torneio.
 */
export async function getPropostasPendentes(
  supabase: ServerClient,
  tournamentId: string
): Promise<PropostaPendente[]> {
  const { data, error } = await supabase
    .from("match_score_proposals")
    .select(
      `id, placar_1, placar_2,
       match:matches!match_score_proposals_match_id_fkey!inner (
         tournament_id,
         vaga_1:tournament_slots!matches_vaga_1_fkey ( rotulo, clube:teams ( nome ) ),
         vaga_2:tournament_slots!matches_vaga_2_fkey ( rotulo, clube:teams ( nome ) )
       )`
    )
    .eq("status", "pendente")
    .eq("match.tournament_id", tournamentId)
    .order("created_at", { ascending: true })

  if (error || !data) return []

  return (data as unknown as Array<{
    id: string
    placar_1: number
    placar_2: number
    match: { vaga_1: LadoEmbed; vaga_2: LadoEmbed } | null
  }>).map((p) => ({
    id: p.id,
    placar_1: p.placar_1,
    placar_2: p.placar_2,
    lado1: nomeLado(p.match?.vaga_1 ?? null),
    lado2: nomeLado(p.match?.vaga_2 ?? null),
  }))
}
