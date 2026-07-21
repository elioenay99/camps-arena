import { describe, expect, it } from "vitest"

import { escudoEfetivo } from "@/lib/escudoEfetivo"

const CUSTOM = "https://x.supabase.co/storage/v1/object/public/escudos/custom/a/b.png"
const CATALOGO = "https://x.supabase.co/storage/v1/object/public/escudos/117.png"

describe("escudoEfetivo", () => {
  it("o override da liga ganha do catálogo global", () => {
    expect(escudoEfetivo(CUSTOM, CATALOGO)).toBe(CUSTOM)
  })

  it("sem override, vale o catálogo", () => {
    expect(escudoEfetivo(null, CATALOGO)).toBe(CATALOGO)
  })

  it("torneio avulso/legado (competitor_id null) não regride: cai no catálogo", () => {
    // O embed do competidor simplesmente não existe — chega undefined.
    expect(escudoEfetivo(undefined, CATALOGO)).toBe(CATALOGO)
  })

  it("sem os dois, null (a superfície cai no monograma de iniciais)", () => {
    expect(escudoEfetivo(null, null)).toBeNull()
    expect(escudoEfetivo(undefined, undefined)).toBeNull()
  })

  it("competidor por NOME (sem clube do catálogo) pode ter escudo próprio", () => {
    expect(escudoEfetivo(CUSTOM, null)).toBe(CUSTOM)
  })
})
