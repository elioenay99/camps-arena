import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type { Escopo, PapelMembro } from "@/schema/equipe"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type MembroEquipe = {
  userId: string
  nome: string | null
  avatar: string | null
  papel: PapelMembro
  /** ISO timestamp da entrada — útil para ordenar/exibir na UI. */
  desde: string
}

/**
 * Lista os membros (admin/arbitro/moderador) de um campeonato com nome/avatar.
 *
 * Em DUAS consultas em vez de um embed: a view `users_public` não declara FK a
 * partir de `*_members.user_id` (Relationships vazias), então o join PostgREST
 * não está disponível — buscamos os membros e resolvemos os perfis por lista de
 * ids. Server-only; a RLS de leitura é a barreira (consumido por páginas que já
 * checaram visibilidade de bastidores).
 */
export async function getMembros(
  supabase: ServerClient,
  escopo: Escopo,
  id: string
): Promise<MembroEquipe[]> {
  // Ramos por escopo: o client tipado rejeita coluna/tabela dinâmicas sobre a
  // união das duas tabelas — cada ramo opera um tipo concreto.
  const { data: membros, error } =
    escopo === "tournament"
      ? await supabase
          .from("tournament_members")
          .select("user_id, papel, created_at")
          .eq("tournament_id", id)
          .order("created_at", { ascending: true })
      : await supabase
          .from("league_members")
          .select("user_id, papel, created_at")
          .eq("competition_id", id)
          .order("created_at", { ascending: true })
  if (error || !membros || membros.length === 0) {
    return []
  }

  const ids = [...new Set(membros.map((m) => m.user_id))]
  const { data: perfis } = await supabase
    .from("users_public")
    .select("id, nome, avatar")
    .in("id", ids)

  const porId = new Map((perfis ?? []).map((p) => [p.id, p]))

  return membros.map((m) => {
    const perfil = porId.get(m.user_id)
    return {
      userId: m.user_id,
      nome: perfil?.nome ?? null,
      avatar: perfil?.avatar ?? null,
      // O banco só guarda papéis válidos; o cast estreita a string da Row ao
      // union conhecido pela UI.
      papel: m.papel as PapelMembro,
      desde: m.created_at,
    }
  })
}
