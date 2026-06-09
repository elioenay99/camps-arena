/**
 * Monta o valor do header `Content-Security-Policy` para uma request.
 *
 * Função PURA (nonce/isDev/supabaseUrl → string) para ser testável fora do
 * runtime de proxy. A proteção contra XSS mora no `script-src` (nonce +
 * `strict-dynamic`, sem `'unsafe-inline'`). O `style-src` usa `'unsafe-inline'`
 * SEM nonce de propósito: os atributos `style=` inline (UserAvatar/TeamCrest)
 * não são cobertos por nonce, e um nonce no directive faria o browser ignorar
 * o `'unsafe-inline'` (CSP3) — quebrando os avatares.
 */
export function buildContentSecurityPolicy({
  nonce,
  isDev,
  supabaseUrl,
}: {
  nonce: string
  isDev: boolean
  supabaseUrl: string
}): string {
  const supabase = new URL(supabaseUrl)
  const supabaseHttps = `${supabase.protocol}//${supabase.host}`
  // Realtime do painel conecta por WebSocket no mesmo host do Supabase.
  const supabaseWss = `wss://${supabase.host}`
  // CDN de escudos de clube (espelha next.config images.remotePatterns).
  const apiFootball = "https://media.api-sports.io"

  const directives = [
    `default-src 'self'`,
    // 'unsafe-eval' só em dev (React usa eval p/ stacks de erro); some em prod.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    // next/image serve same-origin; blob: = preview de avatar; data: = blur.
    `img-src 'self' blob: data: ${apiFootball} ${supabaseHttps}`,
    `font-src 'self'`,
    `connect-src 'self' ${supabaseHttps} ${supabaseWss}`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ]

  if (!isDev) {
    directives.push("upgrade-insecure-requests")
  }

  return directives.join("; ")
}
