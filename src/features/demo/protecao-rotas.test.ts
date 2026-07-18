import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

// Guarda de regressão: a introdução do /demo público NÃO pode enfraquecer as
// rotas privadas. Não tocamos middleware.ts/proxy.ts — este teste confirma no
// SOURCE que /dashboard continua protegido e que /demo não foi adicionado aos
// prefixos protegidos nem "liberado" no matcher.

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

  it("o matcher do proxy não isenta /demo explicitamente", () => {
    const proxy = readFileSync(resolve(RAIZ, "src/proxy.ts"), "utf8")
    // /demo deve passar pelo matcher normalmente (CSP+nonce), sem exceção.
    expect(proxy).not.toContain("/demo")
  })
})
