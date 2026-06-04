import { describe, expect, it } from "vitest"

import { safeRedirectPath } from "@/lib/safe-redirect"

describe("safeRedirectPath", () => {
  it("aceita caminho interno", () => {
    expect(safeRedirectPath("/dashboard/x")).toBe("/dashboard/x")
  })

  it("rejeita URL absoluta (open-redirect)", () => {
    expect(safeRedirectPath("https://evil.example/phish")).toBe("/dashboard")
  })

  it("rejeita protocol-relative //", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/dashboard")
  })

  it("rejeita backslash (parser WHATWG trata \\ como /)", () => {
    // new URL('/\\evil.com', base) → https://evil.com/ — clássico open-redirect.
    expect(safeRedirectPath("/\\evil.com")).toBe("/dashboard")
    expect(safeRedirectPath("/\\/evil.com")).toBe("/dashboard")
    expect(safeRedirectPath("\\\\evil.com")).toBe("/dashboard")
  })

  it("rejeita caracteres de controle que mascaram // (tab/CR/LF)", () => {
    expect(safeRedirectPath("/\t//evil.com")).toBe("/dashboard")
    expect(safeRedirectPath("/\n//evil.com")).toBe("/dashboard")
  })

  it("preserva caminho interno com query e hash", () => {
    expect(safeRedirectPath("/dashboard?aba=2#topo")).toBe("/dashboard?aba=2#topo")
  })

  it("rejeita null/undefined/vazio", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard")
    expect(safeRedirectPath(undefined)).toBe("/dashboard")
    expect(safeRedirectPath("")).toBe("/dashboard")
  })

  it("rejeita valor não-string (File de FormData)", () => {
    const arquivo = new File(["x"], "x.txt")
    expect(safeRedirectPath(arquivo)).toBe("/dashboard")
  })

  it("usa o fallback custom quando informado", () => {
    expect(safeRedirectPath("javascript:alert(1)", "/login")).toBe("/login")
  })
})
