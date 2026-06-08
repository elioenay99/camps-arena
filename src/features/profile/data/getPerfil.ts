import "server-only"

import { createClient } from "@/lib/supabase/server"

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
    .select("id, nome, celular, avatar")
    .eq("id", user.id)
    .maybeSingle()

  return data ?? { id: user.id, nome: null, celular: null, avatar: null }
}
