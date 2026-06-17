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
     * - sentry-tunnel (o túnel do Sentry NÃO pode passar pelo updateSession do
     *   Supabase — sob Turbopack falharia em silêncio; 1º termo do lookahead)
     * - opengraph-image, twitter-image (cards OG da marca: PNG estático; não
     *   precisam de nonce/CSP nem de um getUser por hit de crawler)
     * - sw.js, offline.html (PWA Fase 2: o nonce do proxy quebraria o estilo/
     *   script inline da página offline servida do cache, e o SW recebe sua CSP
     *   própria do next.config; ambos dispensam o updateSession)
     * - _next/static, _next/image
     * - favicon.ico e arquivos estáticos comuns
     * O `(?:$|/)` ancora os termos-palavra ao fim do segmento: só a rota
     * exata (e filhos) é isenta — uma rota futura que só COMPARTILHE o prefixo
     * (ex.: /opengraph-imagery, /swag, /offline-foo) segue passando pelo
     * auth-gate/CSP. O ponto é ESCAPADO em sw\.js/offline\.html (sem o escape,
     * /sw-js ou /offlineXhtml vazariam). Guard em src/proxy.test.ts. (Matcher é
     * literal estático: exigência do Next.)
     */
    "/((?!(?:sentry-tunnel|opengraph-image|twitter-image|sw\\.js|offline\\.html)(?:$|/)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
