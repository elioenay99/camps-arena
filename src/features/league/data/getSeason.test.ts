import { beforeEach, describe, expect, it, vi } from "vitest"

// `getSeason` é server-only e lê o banco via `createClient`; a capacidade GERIR
// vem de `podeGerir` (app-layer). Mockamos ambos: o fake do Supabase resolve as
// duas queries (season + competidores) e `podeGerir` é o interruptor do cenário.
// FOCO (add-liga-visao-leitura): o loader NÃO retorna mais `null` por capacidade —
// devolve os dados + a flag `podeGerir`. `null` só quando a season é invisível
// (query vazia via RLS).
vi.mock("server-only", () => ({}))

const { createClientMock, podeGerirMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  podeGerirMock: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }))
vi.mock("@/lib/autorizacao", () => ({ podeGerir: podeGerirMock }))

import { getSeason } from "@/features/league/data/getSeason"

const OWNER = "owner-1"
const COMP = "competition-1"

/** Linha da season no shape do embed do select (o loader faz casts). */
function seasonRow() {
  return {
    id: "season-1",
    numero: 1,
    status: "ativa",
    ciclo: "anual",
    competition: {
      id: COMP,
      nome: "Pirâmide",
      created_by: OWNER,
      cor_primaria: null,
      cor_secundaria: null,
    },
    league_division_seasons: [
      {
        id: "div-1",
        nivel: 1,
        nome: "Série A",
        por_nome: false,
        desempate: "saldo",
        tamanho: 4,
        tournament_id: "t-1",
        tournament_id_clausura: null,
        final_tournament_id: null,
        cor_primaria: null,
        cor_secundaria: null,
        formato: "liga",
        ida_e_volta: false,
        apertura: { status: "ativo" },
      },
    ],
    league_boundaries: [],
  }
}

/**
 * Fake do Supabase: `league_seasons` → maybeSingle; `league_competitors` →
 * thenable (await direto após `.eq`). `season` null simula season invisível (RLS).
 */
function fakeSupabase(opts: { season: unknown; competidores?: unknown[] }) {
  const client = {
    from(table: string) {
      const resolver = () => {
        if (table === "league_seasons") return { data: opts.season, error: null }
        if (table === "league_competitors")
          return { data: opts.competidores ?? [], error: null }
        throw new Error(`fakeSupabase: tabela inesperada "${table}"`)
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => resolver(),
        then: (
          onF: (v: { data: unknown; error: null }) => unknown,
          onR?: (e: unknown) => unknown
        ) => Promise.resolve(resolver()).then(onF, onR),
      }
      return chain
    },
  }
  return client as unknown
}

beforeEach(() => {
  createClientMock.mockReset()
  podeGerirMock.mockReset()
})

describe("getSeason — visão de leitura com flag de capacidade", () => {
  it("gestor (podeGerir=true): devolve os dados COM podeGerir=true", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ season: seasonRow() }))
    podeGerirMock.mockResolvedValue(true)

    const temporada = await getSeason("season-1", OWNER)

    expect(temporada).not.toBeNull()
    expect(temporada?.podeGerir).toBe(true)
    expect(temporada?.seasonId).toBe("season-1")
    expect(temporada?.divisoes).toHaveLength(1)
  })

  it("leitor (podeGerir=false): NÃO retorna null — devolve os dados COM podeGerir=false", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ season: seasonRow() }))
    podeGerirMock.mockResolvedValue(false)

    const temporada = await getSeason("season-1", "leitor-1")

    // Regressão do bug: antes o loader retornava null aqui → 404 do jogador.
    expect(temporada).not.toBeNull()
    expect(temporada?.podeGerir).toBe(false)
    expect(temporada?.divisoes).toHaveLength(1)
  })

  it("season invisível/inexistente (RLS): retorna null (sem checar capacidade)", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ season: null }))
    podeGerirMock.mockResolvedValue(true)

    const temporada = await getSeason("season-x")

    expect(temporada).toBeNull()
    // A capacidade nem é consultada quando a season não é visível.
    expect(podeGerirMock).not.toHaveBeenCalled()
  })
})
