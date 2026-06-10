import "server-only"

import { createClient } from "@/lib/supabase/server"
import type {
  TournamentFormat,
  TournamentStatus,
} from "@/lib/supabase/database.types"

export interface TorneioResumo {
  id: string
  titulo: string
  status: TournamentStatus
  formato: TournamentFormat
}

export interface MeusTorneios {
  /** Criados pelo usuário (qualquer status — o índice é o acervo dele). */
  organizo: TorneioResumo[]
  /** Onde é participante confirmado SEM ser o dono (sem duplicar "organizo"). */
  participo: TorneioResumo[]
}

/**
 * Torneios do usuário para o índice /dashboard/torneios. Duas queries: a RLS
 * de tournaments também deixa passar públicos de terceiros, então "confiar na
 * RLS" listaria torneios alheios — `organizo` filtra por `created_by` e
 * `participo` parte de `participants` (embed com FK-hint).
 */
export async function getMeusTorneios(userId: string): Promise<MeusTorneios> {
  const supabase = await createClient()

  const [organizoRes, participoRes] = await Promise.all([
    supabase
      .from("tournaments")
      .select("id, titulo, status, formato")
      .eq("created_by", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("participants")
      .select(
        "tournament:tournaments!participants_tournament_id_fkey ( id, titulo, status, formato, created_by )"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ])

  if (organizoRes.error) {
    throw new Error(`Falha ao carregar seus torneios: ${organizoRes.error.message}`)
  }
  if (participoRes.error) {
    throw new Error(
      `Falha ao carregar suas participações: ${participoRes.error.message}`
    )
  }

  const participoLinhas = (participoRes.data ?? []) as unknown as Array<{
    tournament: {
      id: string
      titulo: string
      status: TournamentStatus
      formato: TournamentFormat
      created_by: string | null
    } | null
  }>

  return {
    organizo: organizoRes.data ?? [],
    participo: participoLinhas
      .map((linha) => linha.tournament)
      // Embed nulo não acontece (FK NOT NULL), mas o filtro também tira os
      // torneios PRÓPRIOS — o dono participa, e duplicar as listas é ruído.
      .filter(
        (t): t is NonNullable<typeof t> => t !== null && t.created_by !== userId
      )
      .map(({ id, titulo, status, formato }) => ({
        id,
        titulo,
        status,
        formato,
      })),
  }
}
