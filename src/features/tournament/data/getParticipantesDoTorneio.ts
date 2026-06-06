import "server-only"

import { createClient } from "@/lib/supabase/server"

export interface ParticipanteDoTorneio {
  id: string
  nome: string | null
}

/**
 * Participantes CONFIRMADOS do torneio — alimenta a lista da página do
 * torneio e os selects do form de nova partida. A visibilidade vem da RLS
 * (`participants_select_visivel`: quem vê o torneio vê a lista). Embed com
 * FK-hint explícito (padrão do repo) e SÓ id/nome — sem `celular` (PII
 * desnecessária neste contexto). Ordem por entrada (created_at): estável,
 * não reordena conforme participantes renomeiam o perfil.
 */
export async function getParticipantesDoTorneio(
  tournamentId: string
): Promise<ParticipanteDoTorneio[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("participants")
    .select("user_id, usuario:users!participants_user_id_fkey ( id, nome )")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Falha ao carregar participantes: ${error.message}`)
  }

  // Embed to-one chega como objeto único; tipo explícito na fronteira de
  // confiança (mesma decisão de getTournamentClassificacao).
  const linhas = (data ?? []) as unknown as Array<{
    user_id: string
    usuario: { id: string; nome: string | null } | null
  }>

  return linhas.map((linha) => ({
    id: linha.user_id,
    nome: linha.usuario?.nome ?? null,
  }))
}
