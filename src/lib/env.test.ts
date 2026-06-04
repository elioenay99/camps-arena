import { afterEach, describe, expect, it, vi } from "vitest"

import { apiFootballKey, env, parseEnv } from "@/lib/env"

const VALIDO = {
  NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anon",
}

describe("parseEnv", () => {
  it("aceita ambiente válido e tipa o resultado", () => {
    const r = parseEnv({ ...VALIDO, NEXT_PUBLIC_SITE_URL: "https://arena.exemplo.com" })
    expect(r).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "chave-anon",
      NEXT_PUBLIC_SITE_URL: "https://arena.exemplo.com",
    })
  })

  it("nomeia TODAS as variáveis faltantes numa única mensagem", () => {
    expect(() => parseEnv({})).toThrowError(
      expect.objectContaining({
        message: expect.stringMatching(
          /NEXT_PUBLIC_SUPABASE_URL: ausente[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY: ausente/
        ),
      })
    )
  })

  it("trata campo em branco (VAR=) como ausente, não como valor inválido", () => {
    expect(() =>
      parseEnv({ ...VALIDO, NEXT_PUBLIC_SUPABASE_URL: "" })
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL: ausente/)
  })

  it("rejeita URL malformada nomeando a variável", () => {
    expect(() =>
      parseEnv({ ...VALIDO, NEXT_PUBLIC_SUPABASE_URL: "nao-e-url" })
    ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it("rejeita esquema fora de http(s) — javascript:/ftp: não são URLs de serviço", () => {
    for (const url of ["javascript:alert(1)", "ftp://exemplo.supabase.co", "mailto:a@b.c"]) {
      expect(() =>
        parseEnv({ ...VALIDO, NEXT_PUBLIC_SUPABASE_URL: url })
      ).toThrowError(/NEXT_PUBLIC_SUPABASE_URL/)
    }
  })

  it("rejeita NEXT_PUBLIC_SITE_URL malformada (quando presente)", () => {
    expect(() =>
      parseEnv({ ...VALIDO, NEXT_PUBLIC_SITE_URL: "arena sem esquema" })
    ).toThrowError(/NEXT_PUBLIC_SITE_URL/)
  })

  it("aplica o default de NEXT_PUBLIC_SITE_URL quando ausente", () => {
    const r = parseEnv(VALIDO)
    expect(r.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000")
  })

  it("aplica o default de NEXT_PUBLIC_SITE_URL quando em branco (VAR=)", () => {
    const r = parseEnv({ ...VALIDO, NEXT_PUBLIC_SITE_URL: "" })
    expect(r.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000")
  })

  it("a mensagem aponta para .env.local/.env.example (DX de correção)", () => {
    expect(() => parseEnv({})).toThrowError(/\.env\.local.*\.env\.example/)
  })
})

describe("env (parse eager no load do módulo)", () => {
  it("expõe o ambiente validado com os dummies do vitest.config", () => {
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://exemplo.supabase.co")
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("chave-anon-de-teste")
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("http://localhost:3000")
  })
})

describe("apiFootballKey (runtime, server-only)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("retorna a chave quando definida", () => {
    vi.stubEnv("API_FOOTBALL_KEY", "chave-teste")
    expect(apiFootballKey()).toBe("chave-teste")
  })

  it("retorna undefined quando ausente", () => {
    vi.stubEnv("API_FOOTBALL_KEY", undefined)
    expect(apiFootballKey()).toBeUndefined()
  })

  it("trata chave em branco como ausente (degradação graciosa)", () => {
    vi.stubEnv("API_FOOTBALL_KEY", "")
    expect(apiFootballKey()).toBeUndefined()
  })

  it("lê em RUNTIME: reflete mudanças por chamada (compatível com stubs por teste)", () => {
    vi.stubEnv("API_FOOTBALL_KEY", "primeira")
    expect(apiFootballKey()).toBe("primeira")
    vi.stubEnv("API_FOOTBALL_KEY", "segunda")
    expect(apiFootballKey()).toBe("segunda")
  })
})
