"use server"

import { z } from "zod"

import { getScorerSuggestions } from "@/features/match/data/getScorerSuggestions"
import { createClient } from "@/lib/supabase/server"

/**
 * Autocomplete dos autores de gol no modal de placar: dado o SLOT (vaga) de um
 * lado, resolve o competidor persistente e devolve os nomes que ele já usou
 * (por frequência). Escopado ao competidor daquele lado — os nomes de um
 * competidor nunca vazam para o autocomplete de outro.
 *
 * Read-only e best-effort: valida sessão e devolve `[]` em qualquer falha (uuid
 * inválido, vaga sem competidor, RLS, erro de IO) — o autocomplete é auxiliar e
 * nunca bloqueia o lançamento do placar.
 */
export async function sugestoesDeAutorGol(vagaId: unknown): Promise<string[]> {
  const parsed = z.uuid().safeParse(vagaId)
  if (!parsed.success) return []

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // A vaga carrega o competidor persistente (a RLS de tournament_slots libera a
  // leitura a quem enxerga o torneio). Sem competidor (avulso/legado) → sem
  // sugestões.
  const { data: slot } = await supabase
    .from("tournament_slots")
    .select("competitor_id")
    .eq("id", parsed.data)
    .maybeSingle()
  if (!slot?.competitor_id) return []

  return getScorerSuggestions(supabase, { competitorId: slot.competitor_id })
}
