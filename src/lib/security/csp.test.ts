import { describe, expect, it } from "vitest"

import { buildContentSecurityPolicy } from "@/lib/security/csp"

const SUPABASE = "https://proj.supabase.co"

function build(over: Partial<Parameters<typeof buildContentSecurityPolicy>[0]> = {}) {
  return buildContentSecurityPolicy({
    nonce: "NONCE123",
    isDev: false,
    supabaseUrl: SUPABASE,
    ...over,
  })
}

describe("buildContentSecurityPolicy", () => {
  it("script-src é estrito: nonce do request + strict-dynamic, sem unsafe-inline", () => {
    const csp = build()
    expect(csp).toContain("script-src 'self' 'nonce-NONCE123' 'strict-dynamic'")
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })

  it("style-src usa unsafe-inline e NÃO embute nonce (senão o browser ignoraria unsafe-inline)", () => {
    const csp = build()
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).not.toMatch(/style-src[^;]*nonce-/)
  })

  it("connect-src libera o Supabase por https e wss (Realtime)", () => {
    const csp = build()
    expect(csp).toContain("connect-src 'self' https://proj.supabase.co wss://proj.supabase.co")
  })

  it("img-src cobre blob: (preview), data: (blur) e os hosts de imagem", () => {
    const csp = build()
    expect(csp).toMatch(/img-src 'self' blob: data: https:\/\/media\.api-sports\.io https:\/\/proj\.supabase\.co/)
  })

  it("trava base/frame/object/form", () => {
    const csp = build()
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("default-src 'self'")
  })

  it("DEV adiciona unsafe-eval e NÃO faz upgrade-insecure-requests", () => {
    const csp = build({ isDev: true })
    expect(csp).toMatch(/script-src[^;]*'unsafe-eval'/)
    expect(csp).not.toContain("upgrade-insecure-requests")
  })

  it("PROD adiciona upgrade-insecure-requests e NÃO tem unsafe-eval", () => {
    const csp = build({ isDev: false })
    expect(csp).toContain("upgrade-insecure-requests")
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it("deriva o host exato do Supabase informado", () => {
    const csp = build({ supabaseUrl: "https://outro-projeto.supabase.co" })
    expect(csp).toContain("wss://outro-projeto.supabase.co")
    expect(csp).not.toContain("proj.supabase.co")
  })
})
