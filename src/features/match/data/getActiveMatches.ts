import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { MatchStatus, TournamentStatus } from "@/lib/supabase/database.types"

export interface ParticipanteResumo {
  nome: string | null
  avatar: string | null
  /** PII: legível só por authenticated (RLS). Alimenta o atalho wa.me. */
  celular: string | null
}

export interface ClubeResumo {
  nome: string
  escudo_url: string | null
}

export interface PartidaAtiva {
  id: string
  placar_1: number
  placar_2: number
  status: MatchStatus
  created_at: string
  tournament: { titulo: string; status: TournamentStatus } | null
  participante_1: ParticipanteResumo | null
  participante_2: ParticipanteResumo | null
  time_1: ClubeResumo | null
  time_2: ClubeResumo | null
}

/**
 * Lista as partidas ativas (não encerradas) com os dois participantes e o
 * torneio embutidos em UMA query.
 *
 * - FK-hint explícito (`users!matches_participante_1_fkey`) desambigua os dois
 *   relacionamentos matches→users; sem ele o PostgREST não resolve o embed.
 * - Embed contra a TABELA `users` (não a view `users_public`): a rota é
 *   autenticada e a RLS `users_select_authenticated` libera o `celular`, que o
 *   modal usa para o atalho de WhatsApp.
 * - `.neq('encerrada')` em vez de `.eq(...)`: falha-segura — um novo status
 *   intermediário no enum aparece por padrão em vez de sumir silenciosamente.
 * - Ordem por `created_at` ascendente: estável (não reordena a lista a cada
 *   atualização de placar, ao contrário de `updated_at`).
 */
export async function getActiveMatches(): Promise<PartidaAtiva[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, placar_1, placar_2, status, created_at,
       tournament:tournaments!matches_tournament_id_fkey ( titulo, status ),
       participante_1:users!matches_participante_1_fkey ( nome, avatar, celular ),
       participante_2:users!matches_participante_2_fkey ( nome, avatar, celular ),
       time_1:teams!matches_time_1_fkey ( nome, escudo_url ),
       time_2:teams!matches_time_2_fkey ( nome, escudo_url )`
    )
    .neq("status", "encerrada")
    .order("created_at", { ascending: true })

  if (error) {
    // Borbulha para o error.tsx; em produção o Next mascara a mensagem do
    // servidor (só o digest chega ao cliente) — sem vazamento de detalhes.
    throw new Error(`Falha ao carregar partidas ativas: ${error.message}`)
  }

  // Embeds to-one chegam como objeto único (ou null para FK anulável); o tipo
  // explícito é a fonte de verdade nesta fronteira de confiança.
  return (data ?? []) as unknown as PartidaAtiva[]
}
