import "server-only"

import type { createClient } from "@/lib/supabase/server"

import type { CupCompetitionStatus } from "@/lib/supabase/database.types"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Uma copa alimentada por uma pirâmide (visão consolidada — change copa-todos-da-piramide). */
export interface CopaDaPiramide {
  id: string
  nome: string
  status: CupCompetitionStatus
}

/**
 * Copas alimentadas por uma pirâmide (ZERO-DDL): as `cup_competitions` distintas
 * com ao menos uma regra de qualificação (`divisao` ou `divisao_todos`) cujo
 * `origem_competition_id` é a pirâmide. A RLS de `cup_qualification_rules` (e o
 * embed `!inner` de `cup_competitions`) já gateia a visibilidade — copa pública OU
 * do próprio dono; a de terceiro privada some. Dedup por copa (uma copa com várias
 * regras da mesma pirâmide aparece uma vez), ordenado por nome.
 *
 * Retorna `[]` sem vínculo ou em erro de IO (a seção cai no empty-state).
 */
export async function getCopasDaPiramide(
  supabase: ServerClient,
  competitionId: string
): Promise<CopaDaPiramide[]> {
  const { data, error } = await supabase
    .from("cup_qualification_rules")
    .select(
      "cup_competition_id, cup_competitions!cup_qualification_rules_cup_competition_id_fkey!inner ( id, nome, status )"
    )
    .eq("origem_competition_id", competitionId)
    .in("origem_tipo", ["divisao", "divisao_todos"])

  if (error || !data) return []

  const porId = new Map<string, CopaDaPiramide>()
  for (const linha of data) {
    const copa = linha.cup_competitions as unknown as {
      id: string
      nome: string
      status: CupCompetitionStatus
    } | null
    if (!copa || porId.has(copa.id)) continue
    porId.set(copa.id, { id: copa.id, nome: copa.nome, status: copa.status })
  }

  return [...porId.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR")
  )
}
