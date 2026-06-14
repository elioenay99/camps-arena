import { beforeEach, describe, expect, it, vi } from "vitest"

// `getCompetitorProfile` e `resolverCampeaoDivisaoSplit` são server-only e leem o
// banco via `createClient`; o resolver ainda delega a leitura das tabelas de
// classificação ao `getTournamentClassificacao` (também server-only). Mockamos os
// três módulos para exercitar a CASCATA DO CAMPEÃO (5.1c) com fixtures: a combinada
// NÃO coroa — o título é do vencedor da grande final (ou do campeão direto), e a
// divisão anual segue o legado (campeão = posicao_final === 1).
vi.mock("server-only", () => ({}))

// `vi.mock` é hoisted acima das declarações; `vi.hoisted` cria os spies no mesmo
// nível para que as factories os enxerguem sem TDZ.
const { createClientMock, getTournamentClassificacaoMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getTournamentClassificacaoMock: vi.fn(),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: (id: string) => getTournamentClassificacaoMock(id),
}))

import { getCompetitorProfile } from "@/features/league/data/getCompetitorProfile"

/* -------------------------------------------------------------------------- */
/* Fixtures de classificação (shape mínimo que o resolver realmente lê)         */
/* -------------------------------------------------------------------------- */

type LinhaFake = { participanteId: string; posicao: number; nome: string }

// Classificação de LIGA (turno): só `linhas` + status do torneio são lidos no ramo
// "campeão direto"; `chave` fica vazia (não é mata-mata).
function ligaClass(
  status: string,
  linhas: LinhaFake[]
): {
  torneio: { status: string }
  linhas: LinhaFake[]
  chave: unknown[]
} {
  return { torneio: { status }, linhas, chave: [] }
}

// Classificação da GRANDE FINAL (mata-mata ida-e-volta de 2 = 1 vaga). O resolver
// só lê `chave`; montamos um confronto de jogo único já DECIDIDO (vencedor = quem
// fez mais gols). Espelha o shape de PartidaDaChave consumido em getGrandeFinal.
function finalClass(
  slotVencedor: string,
  nomeVencedor: string,
  slotPerdedor: string,
  nomePerdedor: string
): {
  torneio: { status: string }
  linhas: never[]
  chave: Array<Record<string, unknown>>
} {
  return {
    torneio: { status: "encerrado" },
    linhas: [],
    chave: [
      {
        rodada: 1,
        posicao: 1,
        perna: null,
        participante_1: slotVencedor,
        participante_2: slotPerdedor,
        nome_1: nomeVencedor,
        nome_2: nomePerdedor,
        placar_1: 2,
        placar_2: 0,
        status: "encerrada",
        wo: false,
        woVencedor: null,
      },
    ],
  }
}

/* -------------------------------------------------------------------------- */
/* Fake do Supabase: builder chainável resolvido por (tabela + filtros eq)      */
/* -------------------------------------------------------------------------- */

type EqFiltros = Record<string, unknown>

/**
 * Resolve o resultado de uma query a partir da tabela e dos filtros `eq`
 * acumulados. Cada `respostas[tabela]` é uma função que recebe os filtros e
 * devolve `{ data }` (ou `null` p/ ausência). O builder suporta a cadeia usada
 * pelos dois fetchers: select / eq / not / order / limit / maybeSingle e o
 * próprio thenable (await direto após `.eq`/`.not`).
 */
function fakeSupabase(opts: {
  user: { id: string } | null
  respostas: Record<string, (eq: EqFiltros) => { data: unknown }>
}) {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    from(table: string) {
      const eq: EqFiltros = {}
      const resolver = () => {
        const fn = opts.respostas[table]
        if (!fn) throw new Error(`fakeSupabase: tabela inesperada "${table}"`)
        return { ...fn(eq), error: null }
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          eq[col] = val
          return chain
        },
        in: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => resolver(),
        single: async () => resolver(),
        // Thenable: `await supabase.from(...).select(...).eq(...)` resolve aqui.
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

const OWNER = "owner-1"

// Linha de competidor (ramo de identidade/gate) — pirâmide ativa do dono.
const compRow = (id: string) => ({
  id,
  rotulo: "Time A",
  team_id: null,
  team: null,
  competition: {
    id: "competition-1",
    nome: "Pirâmide",
    status: "ativa",
    created_by: OWNER,
  },
})

// Entrada consolidada (posicao_final preenchida) embutindo a geometria da divisão.
function entry(args: {
  posicaoFinal: number
  nivel?: number
  ciclo: string
  divisionSeasonId: string
  tournamentId: string | null
  tournamentIdClausura: string | null
  finalTournamentId: string | null
}) {
  return {
    posicao_final: args.posicaoFinal,
    destino: null,
    pontos: 10,
    jogos: 5,
    division: {
      id: args.divisionSeasonId,
      nivel: args.nivel ?? 1,
      nome: "Divisão",
      tournament_id: args.tournamentId,
      tournament_id_clausura: args.tournamentIdClausura,
      final_tournament_id: args.finalTournamentId,
      season: { numero: 1, ciclo: args.ciclo },
    },
  }
}

beforeEach(() => {
  createClientMock.mockReset()
  getTournamentClassificacaoMock.mockReset()
})

describe("getCompetitorProfile — cascata do CAMPEÃO em season split (5.1c)", () => {
  it("(a) split com GRANDE FINAL decidida: líder da combinada que PERDEU a final NÃO ganha título; o VENCEDOR ganha", async () => {
    // Divisão split nível 1 com final montada+decidida. A perfil é do LÍDER, mas a
    // final foi vencida por B ⇒ o líder (A) não titula; B sim.
    const LIDER = "comp-A" // posicao_final===1 da combinada (NÃO basta para titular)
    const VENCEDOR_FINAL = "comp-B"
    const slotVencedor = "finalSlot-B"
    const slotPerdedor = "finalSlot-A"

    getTournamentClassificacaoMock.mockImplementation((id: string) => {
      if (id === "final-1") {
        return Promise.resolve(
          finalClass(slotVencedor, "Time B", slotPerdedor, "Time A")
        )
      }
      return Promise.resolve(null)
    })

    const supabaseParaLider = (competitorId: string) =>
      fakeSupabase({
        user: { id: OWNER },
        respostas: {
          league_competitors: () => ({ data: compRow(competitorId) }),
          league_seasons: () => ({ data: { id: "season-1" } }),
          league_division_entries: () => ({
            data: [
              entry({
                posicaoFinal: competitorId === LIDER ? 1 : 2,
                nivel: 1,
                ciclo: "apertura_clausura",
                divisionSeasonId: "div-1",
                tournamentId: "ap-1",
                tournamentIdClausura: "cl-1",
                finalTournamentId: "final-1",
              }),
            ],
          }),
          // Slots da final: o slot vencedor pertence ao competidor B.
          tournament_slots: () => ({
            data: [
              { id: slotVencedor, competitor_id: VENCEDOR_FINAL },
              { id: slotPerdedor, competitor_id: LIDER },
            ],
          }),
        },
      })

    // Perfil do LÍDER (perdeu a final): título NÃO conta.
    createClientMock.mockResolvedValueOnce(supabaseParaLider(LIDER))
    const perfilLider = await getCompetitorProfile(LIDER)
    expect(perfilLider).not.toBeNull()
    expect(perfilLider!.historico[0].campeao).toBe(false)
    expect(perfilLider!.historico[0].posicaoFinal).toBe(1) // era o líder da combinada
    expect(perfilLider!.titulos).toBe(0)
    expect(perfilLider!.titulosElite).toBe(0)

    // Perfil do VENCEDOR da final: título conta (e é da elite, nível 1).
    createClientMock.mockResolvedValueOnce(supabaseParaLider(VENCEDOR_FINAL))
    const perfilCampeao = await getCompetitorProfile(VENCEDOR_FINAL)
    expect(perfilCampeao).not.toBeNull()
    expect(perfilCampeao!.historico[0].campeao).toBe(true)
    expect(perfilCampeao!.titulos).toBe(1)
    expect(perfilCampeao!.titulosElite).toBe(1)
  })

  it("(b) campeão DIRETO (mesmo campeão na Apertura e Clausura, sem final): recebe título", async () => {
    // Sem final montada (finalTournamentId null). Os DOIS turnos têm o MESMO
    // campeão (competidor X) ⇒ campeão direto ⇒ título conta, sem grande final.
    const X = "comp-X"
    const apSlotLider = "apS-X" // slot da Apertura (entries.slot_id aponta p/ Apertura)
    const clSlotLider = "clS-X" // slot da Clausura (tournament_slots.competitor_id)

    getTournamentClassificacaoMock.mockImplementation((id: string) => {
      if (id === "ap-2") {
        return Promise.resolve(
          ligaClass("encerrado", [
            { participanteId: apSlotLider, posicao: 1, nome: "Time X" },
            { participanteId: "apS-Y", posicao: 2, nome: "Time Y" },
          ])
        )
      }
      if (id === "cl-2") {
        return Promise.resolve(
          ligaClass("encerrado", [
            { participanteId: clSlotLider, posicao: 1, nome: "Time X" },
            { participanteId: "clS-Y", posicao: 2, nome: "Time Y" },
          ])
        )
      }
      return Promise.resolve(null)
    })

    createClientMock.mockResolvedValueOnce(
      fakeSupabase({
        user: { id: OWNER },
        respostas: {
          league_competitors: () => ({ data: compRow(X) }),
          league_seasons: () => ({ data: { id: "season-2" } }),
          league_division_entries: (eq) => {
            // Duas leituras desta tabela: (1) entries do perfil; (2) o resolver
            // lê entries por division_season_id p/ mapear slot da Apertura→competidor.
            if (eq.division_season_id === "div-2") {
              return { data: [{ competitor_id: X, slot_id: apSlotLider }] }
            }
            return {
              data: [
                entry({
                  posicaoFinal: 1,
                  nivel: 2, // NÃO-elite: titula, mas titulosElite continua 0
                  ciclo: "apertura_clausura",
                  divisionSeasonId: "div-2",
                  tournamentId: "ap-2",
                  tournamentIdClausura: "cl-2",
                  finalTournamentId: null,
                }),
              ],
            }
          },
          // Slots da Clausura: mapeia o slot líder da Clausura → competidor X.
          tournament_slots: () => ({
            data: [
              { id: clSlotLider, competitor_id: X },
              { id: "clS-Y", competitor_id: "comp-Y" },
            ],
          }),
        },
      })
    )

    const perfil = await getCompetitorProfile(X)
    expect(perfil).not.toBeNull()
    expect(perfil!.historico[0].campeao).toBe(true)
    expect(perfil!.titulos).toBe(1)
    expect(perfil!.titulosElite).toBe(0) // nível 2, não elite
  })

  it("(c) divisão ANUAL (legado byte-identico): titula só quem terminou em 1º", async () => {
    // ciclo='anual' ⇒ NÃO chama o resolver de split; campeão = posicao_final === 1.
    // getTournamentClassificacao NUNCA deve ser tocado neste caminho.
    getTournamentClassificacaoMock.mockImplementation(() => {
      throw new Error("anual não deve resolver campeão via grande final")
    })

    const perfilDe = (competitorId: string, posicaoFinal: number) =>
      fakeSupabase({
        user: { id: OWNER },
        respostas: {
          league_competitors: () => ({ data: compRow(competitorId) }),
          league_seasons: () => ({ data: { id: "season-3" } }),
          league_division_entries: () => ({
            data: [
              entry({
                posicaoFinal,
                nivel: 1,
                ciclo: "anual",
                divisionSeasonId: "div-3",
                tournamentId: "ap-3",
                tournamentIdClausura: null,
                finalTournamentId: null,
              }),
            ],
          }),
        },
      })

    // Campeão anual (1º): titula (e é elite).
    createClientMock.mockResolvedValueOnce(perfilDe("comp-1", 1))
    const campeao = await getCompetitorProfile("comp-1")
    expect(campeao!.historico[0].campeao).toBe(true)
    expect(campeao!.titulos).toBe(1)
    expect(campeao!.titulosElite).toBe(1)

    // Vice anual (2º): NÃO titula.
    createClientMock.mockResolvedValueOnce(perfilDe("comp-2", 2))
    const vice = await getCompetitorProfile("comp-2")
    expect(vice!.historico[0].campeao).toBe(false)
    expect(vice!.titulos).toBe(0)
    expect(vice!.titulosElite).toBe(0)
  })
})
