"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import {
  updateMatchScoreSchema,
  updateMatchTeamsSchema,
  type UpdateMatchScoreInput,
  type UpdateMatchTeamsInput,
} from "@/schema/matchSchema"

export type UpdateMatchScoreResult =
  | { ok: true }
  | {
      ok: false
      error: string
      fieldErrors?: Record<string, string[] | undefined>
    }

/**
 * Atualiza o placar de uma partida.
 *
 * Segurança em profundidade (a Server Action é alcançável por POST direto,
 * não só pela UI — ver docs do Next 16):
 *   1. Valida a entrada com Zod.
 *   2. Confere a identidade via `auth.getUser()` (valida o JWT no servidor de
 *      auth; não confia apenas no cookie como `getSession`).
 *   3. Verifica a PROPRIEDADE: o usuário precisa ser participante_1 ou
 *      participante_2 da partida — caso contrário, rejeita.
 *   4. O UPDATE só toca colunas de placar; a RLS (`matches_update_participant`)
 *      é a segunda barreira e o `select()` confirma que uma linha foi afetada.
 */
export async function updateMatchScore(
  input: UpdateMatchScoreInput
): Promise<UpdateMatchScoreResult> {
  const parsed = updateMatchScoreSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Placar inválido.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }
  const { matchId, placar_1, placar_2 } = parsed.data

  const supabase = await createClient()

  // 1) Identidade — valida a sessão no servidor de auth.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // 2) Propriedade — carrega a partida e confere se o usuário participa dela.
  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, participante_1, participante_2")
    .eq("id", matchId)
    .maybeSingle()

  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  const ehParticipante =
    user.id === match.participante_1 || user.id === match.participante_2
  if (!ehParticipante) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  // 3) UPDATE — apenas placares (não dispara o trigger de trava de relações).
  //    `.select()` confirma a escrita: se a RLS barrar ou a partida sumir
  //    entre a checagem e o update, nenhuma linha volta.
  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({ placar_1, placar_2 })
    .eq("id", matchId)
    .select("id")

  if (updateError) {
    return { ok: false, error: "Não foi possível salvar o placar." }
  }
  if (!atualizada || atualizada.length === 0) {
    // Propriedade já foi confirmada acima: 0 linhas aqui indica corrida
    // (partida alterada/removida entre a checagem e o update) ou RLS — não
    // falta de propriedade. Mensagem distinta evita diagnóstico enganoso.
    return {
      ok: false,
      error: "Não foi possível salvar o placar. A partida pode ter sido alterada. Tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  return { ok: true }
}

export type UpdateMatchTeamsResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Associa o clube de um (ou ambos) os lados da partida. Mesma autorização por
 * propriedade da `updateMatchScore` (o participante é o usuário). Não dispara o
 * trigger `lock_match_relations`, que só trava participantes/torneio — `time_1/2`
 * são identidade cosmética e editáveis pelo participante.
 */
export async function updateMatchTeams(
  input: UpdateMatchTeamsInput
): Promise<UpdateMatchTeamsResult> {
  const parsed = updateMatchTeamsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Dados de clube inválidos." }
  }
  const { matchId, time_1, time_2 } = parsed.data

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, participante_1, participante_2")
    .eq("id", matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  const ehParticipante =
    user.id === match.participante_1 || user.id === match.participante_2
  if (!ehParticipante) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  // Aplica só os lados informados (undefined = não mexe).
  const patch: { time_1?: string | null; time_2?: string | null } = {}
  if (time_1 !== undefined) patch.time_1 = time_1
  if (time_2 !== undefined) patch.time_2 = time_2

  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .select("id")
  if (updateError) {
    return { ok: false, error: "Não foi possível salvar o clube." }
  }
  if (!atualizada || atualizada.length === 0) {
    return { ok: false, error: "Você não participa desta partida." }
  }

  revalidatePath("/dashboard")
  return { ok: true }
}
