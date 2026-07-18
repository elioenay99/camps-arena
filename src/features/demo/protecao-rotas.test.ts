import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { config } from "@/proxy"

// Guarda de regressão: a introdução do /demo público NÃO pode enfraquecer as
// rotas privadas. `/demo` pode pular o REFRESH de sessão no corpo do proxy
// (vitrine sem sessão — change isolar-demo-auth), mas continua PASSANDO pelo
// matcher (recebe CSP+nonce) e nunca vira prefixo protegido.

const RAIZ = resolve(__dirname, "../../..")

describe("rotas privadas seguem protegidas", () => {
  it("PROTECTED_PREFIXES mantém /dashboard e NÃO inclui /demo", () => {
    const mw = readFileSync(
      resolve(RAIZ, "src/lib/supabase/middleware.ts"),
      "utf8"
    )
    const linha = mw
      .split("\n")
      .find((l) => l.includes("PROTECTED_PREFIXES ="))
    expect(linha).toBeTruthy()
    expect(linha).toContain("/dashboard")
    expect(linha).not.toContain("/demo")
  })

  it("o matcher do proxy NÃO isenta /demo (segue passando pelo proxy)", () => {
    // O real invariante: /demo não foi "liberado" no matcher; ele continua
    // casando (e recebendo nonce/CSP). O bypass é só do refresh de sessão.
    const re = new RegExp(`^${config.matcher[0]}$`)
    expect(re.test("/demo"), "/demo deve passar pelo matcher").toBe(true)
    expect(
      re.test("/demo/torneios"),
      "/demo/torneios deve passar pelo matcher"
    ).toBe(true)
  })
})
