import { describe, it, expect, vi, beforeEach } from "vitest"

import type { ItemPlanoFluxo } from "@/features/league/flowEngine"

vi.mock("@/features/league/data/getDivisionStandings", () => ({
  getDivisionStandings: vi.fn(),
}))
vi.mock("@/features/league/data/getGrandeFinal", () => ({
  resolverCampeaoDivisaoSplit: vi.fn(),
}))

import { resolverPremiosTemporada } from "./resolverPremiosTemporada"
import { getDivisionStandings } from "@/features/league/data/getDivisionStandings"
import { resolverCampeaoDivisaoSplit } from "@/features/league/data/getGrandeFinal"

const getStandings = vi.mocked(getDivisionStandings)
const getCampeaoSplit = vi.mocked(resolverCampeaoDivisaoSplit)

interface DivRow {
  id: string
  nivel: number
  nome: string
  formato: string
  tournament_id: string | null
  tournament_id_clausura: string | null
  final_tournament_id: string | null
}

/** Supabase fake: só as duas leituras que a função faz (season.ciclo + divisões). */
function fakeSupabase(ciclo: string, divisoes: DivRow[]) {
  return {
    from(table: string) {
      if (table === "league_seasons") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { ciclo }, error: null }) }),
          }),
        }
      }
      if (table === "league_division_seasons") {
        return { select: () => ({ eq: async () => ({ data: divisoes, error: null }) }) }
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  } as never
}

function item(competitorId: string, nivelOrigem: number, posicaoFinal: number): ItemPlanoFluxo {
  return {
    competitorId,
    nivelOrigem,
    nivelDestino: nivelOrigem,
    posicaoFinal,
    pontos: 0,
    jogos: 0,
    destino: "permanece",
    resolvidoPor: "classificacao",
  } as unknown as ItemPlanoFluxo
}

/** Insights com destaques JÁ chaveados por competitor (como getDivisionStandings entrega). */
function standingsComDestaques(ataque: string, defesa: string, seq: string) {
  return {
    insights: {
      formaPorParticipante: new Map(),
      destaques: {
        melhorAtaque: { participanteId: ataque, valor: 47 },
        melhorDefesa: { participanteId: defesa, valor: 12 },
        maiorGoleada: null,
        maiorInvencibilidade: null,
        maiorSequenciaVitorias: { participanteId: seq, extensao: 5 },
        maiorSequenciaCleanSheets: null,
        mediaGolsPorJogo: 2,
      },
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("resolverPremiosTemporada", () => {
  it("divisão liga ANUAL: só destaques (campeão/vice ficam com a RPC) e chaveados por competitor", async () => {
    getStandings.mockResolvedValue(standingsComDestaques("COMP-A", "COMP-B", "COMP-A"))
    const supabase = fakeSupabase("anual", [
      {
        id: "d1",
        nivel: 1,
        nome: "Série A",
        formato: "liga",
        tournament_id: "t1",
        tournament_id_clausura: null,
        final_tournament_id: null,
      },
    ])

    const premios = await resolverPremiosTemporada(supabase, "s1", [])

    // Nenhum campeão/vice (liga-anual é derivado em SQL pela RPC).
    expect(premios.some((p) => p.tipo === "campeao" || p.tipo === "vice")).toBe(false)
    // Destaques presentes e chaveados por COMPETITOR (não por slot).
    const ataque = premios.find((p) => p.tipo === "melhor_ataque")
    expect(ataque).toMatchObject({ competitor_id: "COMP-A", valor_num: 47, nivel: 1 })
    expect(premios.find((p) => p.tipo === "melhor_defesa")).toMatchObject({
      competitor_id: "COMP-B",
      valor_num: 12,
    })
    expect(premios.find((p) => p.tipo === "melhor_sequencia")).toMatchObject({
      competitor_id: "COMP-A",
      valor_num: 5,
    })
  })

  it("REGRESSÃO remap slot→competitor: o payload usa os competitor ids dos insights, nunca slot ids", async () => {
    // getDivisionStandings entrega insights JÁ re-chaveados (competitor). Se a
    // implementação usasse a classificação por SLOT (getTournamentClassificacao),
    // o payload sairia com slot ids e a RPC descartaria os prêmios em silêncio.
    getStandings.mockResolvedValue(standingsComDestaques("COMP-A", "COMP-B", "COMP-A"))
    const slotIds = new Set(["SLOT-1", "SLOT-2", "SLOT-3"])
    const supabase = fakeSupabase("anual", [
      {
        id: "d1",
        nivel: 1,
        nome: "Série A",
        formato: "liga",
        tournament_id: "t1",
        tournament_id_clausura: null,
        final_tournament_id: null,
      },
    ])

    const premios = await resolverPremiosTemporada(supabase, "s1", [])

    expect(premios.length).toBeGreaterThan(0)
    for (const p of premios) {
      expect(slotIds.has(p.competitor_id)).toBe(false)
      expect(p.competitor_id.startsWith("COMP-")).toBe(true)
    }
  })

  it("BLOCKER split: campeão vem do vencedor da grande final, NÃO do líder da combinada, sem duplicar", async () => {
    getCampeaoSplit.mockResolvedValue({ competitorId: "CHAMP-FINAL", nome: "Campeão" })
    getStandings.mockResolvedValue(null) // insights null no split
    const supabase = fakeSupabase("apertura_clausura", [
      {
        id: "d1",
        nivel: 1,
        nome: "Série A",
        formato: "liga",
        tournament_id: "t1",
        tournament_id_clausura: "t1c",
        final_tournament_id: "t1f",
      },
    ])
    // Líder da tabela combinada (posicao_final 1) É DIFERENTE do vencedor da final.
    const itens = [item("LIDER-COMBINADA", 1, 1)]

    const premios = await resolverPremiosTemporada(supabase, "s1", itens)

    const campeoes = premios.filter((p) => p.tipo === "campeao")
    expect(campeoes).toHaveLength(1)
    expect(campeoes[0].competitor_id).toBe("CHAMP-FINAL")
    expect(campeoes[0].competitor_id).not.toBe("LIDER-COMBINADA")
    expect(getCampeaoSplit).toHaveBeenCalledOnce()
  })

  it("split ainda indefinido (resolver null): não emite campeão", async () => {
    getCampeaoSplit.mockResolvedValue(null)
    getStandings.mockResolvedValue(null)
    const supabase = fakeSupabase("apertura_clausura", [
      {
        id: "d1",
        nivel: 1,
        nome: "Série A",
        formato: "liga",
        tournament_id: "t1",
        tournament_id_clausura: "t1c",
        final_tournament_id: null,
      },
    ])

    const premios = await resolverPremiosTemporada(supabase, "s1", [item("X", 1, 1)])
    expect(premios.some((p) => p.tipo === "campeao")).toBe(false)
  })

  it("grupos_mata_mata: campeão/vice = posição final 1/2 (payload), + destaques", async () => {
    getStandings.mockResolvedValue(standingsComDestaques("G1", "G2", "G1"))
    const supabase = fakeSupabase("anual", [
      {
        id: "d2",
        nivel: 2,
        nome: "Série B",
        formato: "grupos_mata_mata",
        tournament_id: "t2",
        tournament_id_clausura: null,
        final_tournament_id: null,
      },
    ])
    const itens = [item("G1", 2, 1), item("G2", 2, 2), item("G3", 2, 3)]

    const premios = await resolverPremiosTemporada(supabase, "s1", itens)

    expect(premios.find((p) => p.tipo === "campeao")).toMatchObject({
      competitor_id: "G1",
      nivel: 2,
      valor_texto: "Série B",
    })
    expect(premios.find((p) => p.tipo === "vice")).toMatchObject({ competitor_id: "G2", nivel: 2 })
    expect(premios.some((p) => p.tipo === "melhor_ataque")).toBe(true)
    expect(getCampeaoSplit).not.toHaveBeenCalled()
  })

  it("sem divisões: payload vazio", async () => {
    const supabase = fakeSupabase("anual", [])
    expect(await resolverPremiosTemporada(supabase, "s1", [])).toEqual([])
  })
})
