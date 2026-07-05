import { describe, expect, it } from "vitest"

import { deriveCompacto, deriveModoInicial } from "@/features/standings/densidade"

describe("deriveModoInicial (default por viewport)", () => {
  it("mobile abre resumido ('caber')", () => {
    expect(deriveModoInicial(true)).toBe("caber")
  })
  it("desktop abre rolando ('rolar')", () => {
    expect(deriveModoInicial(false)).toBe("rolar")
  })
})

describe("deriveCompacto (regra dura: só mobile em 'caber')", () => {
  it("mobile + caber → compacto", () => {
    expect(deriveCompacto(true, "caber")).toBe(true)
  })
  it("mobile + rolar → NÃO compacto (todas as colunas com scroll)", () => {
    expect(deriveCompacto(true, "rolar")).toBe(false)
  })
  it("desktop + caber → NÃO compacto (desktop nunca perde colunas)", () => {
    expect(deriveCompacto(false, "caber")).toBe(false)
  })
  it("desktop + rolar → NÃO compacto", () => {
    expect(deriveCompacto(false, "rolar")).toBe(false)
  })
})
