import { afterEach, describe, expect, it, vi } from "vitest"

import {
  corDoNome,
  cortar,
  escudoDataURL,
  HEX6,
  inicial,
} from "@/features/og/compartilhado"

// Rede de segurança REAL do refactor (change add-frente-compartilhavel): os
// `route.test.ts` de rodada/temporada fazem vi.mock dos renderers e NÃO
// exercitam estes helpers (module-private até a extração). O host da allowlist
// vem do env de teste (vitest.config: NEXT_PUBLIC_SUPABASE_URL =
// https://exemplo.supabase.co) — logo `exemplo.supabase.co` e `media.api-sports.io`
// são confiáveis; qualquer outro host cai no monograma (null) SEM fetch.

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("HEX6", () => {
  it("aceita hex de 6 dígitos", () => {
    expect(HEX6.test("#bd93f9")).toBe(true)
    expect(HEX6.test("#FFFFFF")).toBe(true)
  })

  it("rejeita oklch e hex de 3 dígitos (Satori só entende hex de 6)", () => {
    expect(HEX6.test("oklch(0.7 0.1 200)")).toBe(false)
    expect(HEX6.test("#fff")).toBe(false)
    expect(HEX6.test("#bd93f9ff")).toBe(false)
    expect(HEX6.test("rgb(1,2,3)")).toBe(false)
    expect(HEX6.test("")).toBe(false)
  })
})

describe("corDoNome", () => {
  it("é determinístico (mesmo nome → mesma cor)", () => {
    expect(corDoNome("Palmeiras")).toBe(corDoNome("Palmeiras"))
  })

  it("nomes diferentes tendem a cores diferentes", () => {
    expect(corDoNome("Palmeiras")).not.toBe(corDoNome("Corinthians"))
  })

  it("devolve HSL válido no espaço do monograma", () => {
    expect(corDoNome("Flamengo")).toMatch(/^hsl\(\d+ 45% 32%\)$/)
  })
})

describe("inicial", () => {
  it("primeira letra maiúscula, trimando", () => {
    expect(inicial("  santos")).toBe("S")
    expect(inicial("Água")).toBe("Á")
  })

  it("vazio → '?'", () => {
    expect(inicial("   ")).toBe("?")
    expect(inicial("")).toBe("?")
  })
})

describe("cortar", () => {
  it("preserva nomes curtos", () => {
    expect(cortar("Grêmio")).toBe("Grêmio")
  })

  it("corta com reticências acima do máximo", () => {
    expect(cortar("A".repeat(30), 10)).toBe(`${"A".repeat(9)}…`)
  })
})

describe("escudoDataURL — allowlist anti-SSRF", () => {
  it("host fora da allowlist ⇒ null, SEM fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await escudoDataURL("https://evil.example.com/x.png")).toBeNull()
    // metadata endpoint clássico de SSRF
    expect(await escudoDataURL("http://169.254.169.254/latest/meta-data")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("URL malformada ⇒ null, SEM fetch", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(await escudoDataURL("não é url")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("host confiável ⇒ busca e devolve data URL", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytes.buffer,
        headers: { get: () => "image/png" },
      }))
    )
    const data = await escudoDataURL("https://exemplo.supabase.co/storage/x.png")
    expect(data).toBe(`data:image/png;base64,${Buffer.from(bytes).toString("base64")}`)
  })

  it("host confiável mas resposta !ok ⇒ null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })))
    expect(await escudoDataURL("https://media.api-sports.io/x.png")).toBeNull()
  })
})
