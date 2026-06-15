import "server-only"

import { createClient } from "@/lib/supabase/server"
import { carregarCelulares } from "@/lib/contatos"

export interface Perfil {
  id: string
  nome: string | null
  celular: string | null
  avatar: string | null
}

/**
 * Lê o perfil (nome/celular/avatar) do usuário LOGADO de `public.users`. Devolve
 * null sem sessão; se a linha ainda não existe, devolve um perfil vazio com o id
 * (defesa: o trigger `handle_new_user` cria a linha no cadastro).
 */
export async function getPerfil(): Promise<Perfil | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("users")
    .select("id, nome, avatar")
    .eq("id", user.id)
    .maybeSingle()

  // `celular` (PII) saiu do SELECT direto — a coluna perdeu o grant. Vem pela
  // RPC gated, que resolve o próprio número pelo branch self (id = auth.uid()).
  const celulares = await carregarCelulares(supabase, [user.id])
  const celular = celulares.get(user.id) ?? null

  return {
    id: data?.id ?? user.id,
    nome: data?.nome ?? null,
    celular,
    avatar: data?.avatar ?? null,
  }
}
