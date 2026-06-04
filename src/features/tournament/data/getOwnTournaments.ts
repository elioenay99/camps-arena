import "server-only"

import { createClient } from "@/lib/supabase/server"

export interface TorneioProprio {
  id: string
  titulo: string
}

/**
 * Torneios criados pelo usuário informado e ainda não encerrados — alimenta o
 * select do form de nova partida. Filtro EXPLÍCITO por `created_by` no
 * servidor: a RLS também deixa passar torneios públicos de terceiros, então
 * "confiar na RLS" listaria torneios em que o usuário não pode criar partida.
 * `.neq('encerrado')` falha-segura: rascunho aparece (montagem de tabela);
 * status futuro não some silenciosamente.
 */
export async function getOwnTournaments(userId: string): Promise<TorneioProprio[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tournaments")
    .select("id, titulo")
    .eq("created_by", userId)
    .neq("status", "encerrado")
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Falha ao carregar seus torneios: ${error.message}`)
  }

  return data ?? []
}
