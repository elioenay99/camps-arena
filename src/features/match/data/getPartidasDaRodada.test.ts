import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getPartidasDaRodada } from "@/features/match/data/getPartidasDaRodada"

const TORNEIO = "11111111-1111-4111-8111-111111111111"

/** Supabase falso: from("matches").select(...).eq(...).eq(...) → {data,error}. */
function mockSupabase(rows: unknown[] | null, error: unknown = null) {
  const eqSpy = vi.fn()
  const cadeia2 = Promise.resolve({ data: rows, error })
  const cadeia1 = {
    eq: vi.fn((c: string, v: unknown) => {
      eqSpy(c, v)
      return cadeia2
    }),
  }
  const select = {
    eq: vi.fn((c: string, v: unknown) => {
      eqSpy(c, v)
      return cadeia1
    }),
  }
  const supabase = { from: vi.fn(() => ({ select: vi.fn(() => select) })), eqSpy }
  return supabase as unknown as Parameters<typeof getPartidasDaRodada>[0] & {
    eqSpy: typeof eqSpy
  }
}

const vagaClube = (nome: string, escudo: string | null) => ({
  rotulo: null,
  team: { nome, escudo_url: escudo },
})
const vagaNome = (rotulo: string) => ({ rotulo, team: null })

const match = (over: Record<string, unknown>) => ({
  id: "m",
  posicao: null,
  perna: null,
  created_at: "2026-05-01T00:00:00Z",
  v1: null,
  v2: null,
  ...over,
})

describe("getPartidasDaRodada", () => {
  it("filtra por tournament_id + rodada", async () => {
    const s = mockSupabase([])
    await getPartidasDaRodada(s, TORNEIO, 3)
    expect(s.eqSpy).toHaveBeenCalledWith("tournament_id", TORNEIO)
    expect(s.eqSpy).toHaveBeenCalledWith("rodada", 3)
  })

  it("resolve clube (escudo) e por-nome (monograma)", async () => {
    const s = mockSupabase([
      match({
        id: "a",
        v1: vagaClube("Grêmio", "https://e/g.png"),
        v2: vagaNome("Alfa"),
      }),
    ])
    const r = await getPartidasDaRodada(s, TORNEIO, 1)
    expect(r).toHaveLength(1)
    expect(r[0].lado1).toEqual({ nome: "Grêmio", escudoUrl: "https://e/g.png", porNome: false })
    expect(r[0].lado2).toEqual({ nome: "Alfa", escudoUrl: null, porNome: true })
    expect(r[0].idaEVolta).toBe(false)
  })

  it("pula bye/TBD (lado sem vaga/identidade)", async () => {
    const s = mockSupabase([
      match({ id: "bye", v1: vagaClube("Grêmio", null), v2: null }),
      match({ id: "ok", v1: vagaClube("Inter", null), v2: vagaClube("Bahia", null) }),
    ])
    const r = await getPartidasDaRodada(s, TORNEIO, 1)
    expect(r).toHaveLength(1)
    expect(r[0].lado1.nome).toBe("Inter")
  })

  it("deduplica ida-e-volta (mesma posicao, pernas 1 e 2) em 1 confronto", async () => {
    const s = mockSupabase([
      match({ id: "p1", posicao: 1, perna: 1, v1: vagaClube("A", null), v2: vagaClube("B", null) }),
      match({ id: "p2", posicao: 1, perna: 2, v1: vagaClube("B", null), v2: vagaClube("A", null) }),
    ])
    const r = await getPartidasDaRodada(s, TORNEIO, 2)
    expect(r).toHaveLength(1)
    expect(r[0].idaEVolta).toBe(true)
    expect(r[0].lado1.nome).toBe("A")
  })

  it("propaga erro da query", async () => {
    const s = mockSupabase(null, { message: "down" })
    await expect(getPartidasDaRodada(s, TORNEIO, 1)).rejects.toThrow(/down/)
  })
})
