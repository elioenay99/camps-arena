import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import { env } from "@/lib/env"
import type { Database } from "@/lib/supabase/database.types"

/** Prefixos de rota que exigem sessão autenticada. */
const PROTECTED_PREFIXES = ["/dashboard", "/atualizar-senha"]

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Renova a sessão do Supabase a cada requisição e protege rotas administrativas.
 * IMPORTANTE: sempre retornar o `supabaseResponse` para preservar os cookies.
 *
 * `extraRequestHeaders` (ex.: `x-nonce` + CSP gerados no proxy) entram nos
 * request headers do `NextResponse.next` para que o RSC leia o nonce e o Next o
 * aplique aos scripts. Reconstruímos os headers DEPOIS da mutação de cookie
 * (clone de `request.headers`, que já reflete `request.cookies.set`) — o nonce
 * entra sem perder o refresh de sessão (evita o "logout aleatório").
 */
export async function updateSession(
  request: NextRequest,
  extraRequestHeaders?: Record<string, string>
) {
  function nextWithHeaders() {
    const headers = new Headers(request.headers)
    if (extraRequestHeaders) {
      for (const [key, value] of Object.entries(extraRequestHeaders)) {
        headers.set(key, value)
      }
    }
    return NextResponse.next({ request: { headers } })
  }

  let supabaseResponse = nextWithHeaders()

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = nextWithHeaders()
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // NÃO inserir lógica entre createServerClient e getUser — evita logout aleatório.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isProtected(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirectTo", request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
