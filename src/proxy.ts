import { type NextRequest } from "next/server"

import { env } from "@/lib/env"
import { buildContentSecurityPolicy } from "@/lib/security/csp"
import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  // Nonce único por request: um UUID já é aleatório/imprevisível e válido como
  // nonce de CSP (sem Buffer/btoa — agnóstico ao runtime do proxy).
  const nonce = crypto.randomUUID()
  const isDev = process.env.NODE_ENV === "development"
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  })

  // x-nonce + CSP nos request headers: o Next extrai o nonce do header de
  // request e o aplica aos scripts; o RSC lê o x-nonce via headers().
  const response = await updateSession(request, {
    "x-nonce": nonce,
    "content-security-policy": csp,
  })
  // E na resposta (o browser aplica a política a partir daqui). Inclusive no
  // redirect de auth — header inócuo, defesa em profundidade.
  response.headers.set("content-security-policy", csp)
  return response
}

export const config = {
  matcher: [
    /*
     * Aplica a todas as rotas, exceto:
     * - _next/static, _next/image
     * - favicon.ico e arquivos estáticos comuns
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
