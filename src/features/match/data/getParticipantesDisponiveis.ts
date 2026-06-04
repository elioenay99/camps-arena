import "server-only"

import { createClient } from "@/lib/supabase/server"

export interface ParticipanteDisponivel {
  id: string
  nome: string | null
}

/**
 * Usuários disponíveis como participantes de partida — alimenta os selects do
 * form de nova partida. Lê a TABELA `users` (RLS `users_select_authenticated`;
 * a página é protegida), mas SÓ id/nome — sem `celular` (PII desnecessária
 * neste contexto).
 */
export async function getParticipantesDisponiveis(): Promise<
  ParticipanteDisponivel[]
> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("users")
    .select("id, nome")
    .order("nome", { ascending: true })

  if (error) {
    throw new Error(`Falha ao carregar participantes: ${error.message}`)
  }

  return data ?? []
}
