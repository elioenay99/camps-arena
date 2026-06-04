import type { EmailOtpType } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"

import { safeRedirectPath } from "@/lib/safe-redirect"
import { createClient } from "@/lib/supabase/server"

/**
 * Tipos de OTP que ESTE app emite (cadastro e recuperação). Allowlist em vez
 * de aceitar o `type` cru da query: defesa em profundidade — o token já é o
 * segredo, mas não há motivo para honrar `magiclink`/`invite`/`email_change`
 * por aqui.
 */
const TIPOS_PERMITIDOS = new Set<EmailOtpType>(["signup", "email", "recovery"])

/**
 * Callback dos links de e-mail (confirmação de cadastro e recuperação de
 * senha): troca o token do link por sessão em cookie.
 *
 * Exceção registrada à regra "mutações só via Server Actions" (spec auth):
 * é um GET de navegação iniciado pelo cliente de e-mail — não existe como
 * Server Action.
 *
 * - Caminho primário: `token_hash` + `type` → `verifyOtp`. Padrão SSR do
 *   Supabase (templates com `{{ .TokenHash }}`); independe de cookie prévio,
 *   então o link funciona aberto em OUTRO navegador/dispositivo.
 * - Fallback: `code` → `exchangeCodeForSession`. Cobre templates default
 *   (`{{ .ConfirmationURL }}` + PKCE); só funciona no navegador que iniciou
 *   o fluxo (code verifier em cookie).
 * - `next` validado como caminho interno (anti open-redirect).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const next = safeRedirectPath(searchParams.get("next"))

  const destino = request.nextUrl.clone()
  destino.search = ""

  if (tokenHash && type && TIPOS_PERMITIDOS.has(type)) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      destino.pathname = next
      return NextResponse.redirect(destino)
    }
    console.error("verifyOtp falhou", error.code ?? error.message)
  } else if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      destino.pathname = next
      return NextResponse.redirect(destino)
    }
    console.error("exchangeCodeForSession falhou", error.code ?? error.message)
  }

  // Token ausente/inválido/expirado: volta ao login com aviso, sem detalhes.
  destino.pathname = "/login"
  destino.search = "?aviso=link-invalido"
  return NextResponse.redirect(destino)
}
