import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { env } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

/**
 * Cliente Supabase para o servidor (Server Components, Server Actions, Route Handlers).
 * A sessão é lida/escrita nos cookies da requisição.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Chamado a partir de um Server Component (cookies somente leitura).
            // Pode ser ignorado: o middleware é quem renova a sessão na resposta.
          }
        },
      },
    }
  )
}
