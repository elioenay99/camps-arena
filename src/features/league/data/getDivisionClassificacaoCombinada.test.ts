import { describe, expect, it } from "vitest"
import { vi } from "vitest"

// O fetcher é server-only e importa o client só para tipar o arg (recebe-o por
// argumento). Mockamos ambos para exercitar a lógica de re-chaveamento + união.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getDivisionClassificacaoCombinada } from "@/features/league/data/getDivisionClassificacaoCombinada"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

type Torneio = {
  id: string
  status: string
  pontos_vitoria: number
  pontos_empate: number
  pontos_derrota: number
}
type Slot = {
  id: string
  tournament_id: string
  competitor_id: string | null
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
}
type Partida = {
  tournament_id: string
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  status: string
  wo: boolean
  wo_vencedor: string | null
}

const torneios = (apStatus = "ativo", clStatus = "ativo"): Torneio[] => [
  { id: "ap", status: apStatus, pontos_vitoria: 3, pontos_empate: 1, pontos_derrota: 0 },
  { id: "cl", status: clStatus, pontos_vitoria: 3, pontos_empate: 1, pontos_derrota: 0 },
]

const apSlot = (comp: string, nome: string): Slot => ({
  id: `apS-${comp}`,
  tournament_id: "ap",
  competitor_id: `comp-${comp}`,
  rotulo: null,
  team: { nome, escudo_url: null },
})
const clSlot = (comp: string): Slot => ({
  id: `clS-${comp}`,
  tournament_id: "cl",
  competitor_id: `comp-${comp}`,
  rotulo: null,
  team: null,
})

const m = (
  t: string,
  v1: string,
  v2: string,
  p1: number,
  p2: number
): Partida => ({
  tournament_id: t,
  vaga_1: v1,
  vaga_2: v2,
  placar_1: p1,
  placar_2: p2,
  status: "encerrada",
  wo: false,
  wo_vencedor: null,
})
const wo = (t: string, v1: string, v2: string, vencedor: string): Partida => ({
  tournament_id: t,
  vaga_1: v1,
  vaga_2: v2,
  placar_1: 0,
  placar_2: 0,
  status: "encerrada",
  wo: true,
  wo_vencedor: vencedor,
})

function fakeSupabase(opts: {
  tournaments: Torneio[]
  slots: Slot[]
  matches: Partida[]
  errOn?: "tournaments" | "tournament_slots" | "matches"
}) {
  return {
    from: (table: string) => {
      const data =
        table === "tournaments"
          ? opts.tournaments
          : table === "tournament_slots"
            ? opts.slots
            : opts.matches
      const result = Promise.resolve(
        opts.errOn === table
          ? { data: null, error: { message: "boom", code: "42P01" } }
          : { data, error: null }
      )
      const chain = { select: () => chain, in: () => result }
      return chain
    },
  } as unknown as Parameters<typeof getDivisionClassificacaoCombinada>[0]
}

// Fake que HONRA o filtro `.in(coluna, ids)` (≠ o fake acima, que devolve TODAS as
// linhas). Necessário para provar a invariante §13.4: partidas cujo `tournament_id`
// NÃO está na lista pedida pelo fetcher (a grande final) JAMAIS entram no cálculo —
// e isso só é uma prova honesta se a fonte de fato filtrasse por id.
function fakeSupabaseFiltrante(opts: {
  tournaments: Torneio[]
  slots: Slot[]
  matches: Partida[]
}) {
  return {
    from: (table: string) => {
      const chain = {
        select: () => chain,
        in: (coluna: string, ids: string[]) => {
          const dentro = (v: string | null) => v != null && ids.includes(v)
          const data =
            table === "tournaments"
              ? opts.tournaments.filter((t) => dentro(t.id))
              : table === "tournament_slots"
                ? opts.slots.filter((s) => dentro(s.tournament_id))
                : opts.matches.filter((m) => dentro(m.tournament_id))
          return Promise.resolve({ data, error: null })
        },
      }
      return chain
    },
  } as unknown as Parameters<typeof getDivisionClassificacaoCombinada>[0]
}

const linhaDe = (linhas: LinhaComNome[], comp: string) =>
  linhas.find((l) => l.participanteId === `apS-${comp}`)!

describe("getDivisionClassificacaoCombinada (Fase 5.1)", () => {
  it("soma pontos/jogos das duas meias (chaveado pelo slot da Apertura)", async () => {
    const r = await getDivisionClassificacaoCombinada(
      fakeSupabase({
        tournaments: torneios(),
        slots: [apSlot("A", "Alpha"), apSlot("B", "Beta"), clSlot("A"), clSlot("B")],
        matches: [
          m("ap", "apS-A", "apS-B", 1, 0), // A vence na Apertura
          m("cl", "clS-A", "clS-B", 2, 0), // A vence na Clausura (re-chaveado)
        ],
      }),
      { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
    )
    expect(r).not.toBeNull()
    const a = linhaDe(r!.linhas, "A")
    const b = linhaDe(r!.linhas, "B")
    expect(a.pontos).toBe(6)
    expect(a.jogos).toBe(2)
    expect(a.posicao).toBe(1)
    expect(a.nome).toBe("Alpha") // nome vem do slot da Apertura
    expect(b.pontos).toBe(0)
    expect(b.jogos).toBe(2)
    expect(b.posicao).toBe(2)
    expect(b.nome).toBe("Beta")
  })

  it("h2h do ANO (mini-tabela espanhol) usa as duas meias — diverge do cbf", async () => {
    // A e B empatam em PONTOS (6 cada). A venceu os DOIS confrontos diretos (mini
    // 6×0) mas tem saldo global PIOR (-6 vs +2). Espanhol (mini-tabela) ⇒ A acima;
    // cbf (saldo) ⇒ B acima. Mesma base combinada ⇒ prova que a união alimenta o h2h.
    const base = {
      tournaments: torneios(),
      slots: [
        apSlot("A", "Alpha"),
        apSlot("B", "Beta"),
        apSlot("C", "Cesar"),
        apSlot("D", "Delta"),
        clSlot("A"),
        clSlot("B"),
        clSlot("C"),
        clSlot("D"),
      ],
      matches: [
        m("ap", "apS-A", "apS-B", 1, 0), // A vence B (leg 1)
        m("ap", "apS-A", "apS-C", 0, 4), // A leva goleada (saldo ruim)
        m("ap", "apS-B", "apS-D", 2, 0), // B vence D
        m("cl", "clS-A", "clS-B", 1, 0), // A vence B (leg 2 — re-chaveado)
        m("cl", "clS-A", "clS-D", 0, 4), // A leva goleada
        m("cl", "clS-B", "clS-C", 2, 0), // B vence C
      ],
    }

    const esp = await getDivisionClassificacaoCombinada(fakeSupabase(base), {
      aperturaId: "ap",
      clausuraId: "cl",
      desempate: "espanhol",
    })
    const cbf = await getDivisionClassificacaoCombinada(fakeSupabase(base), {
      aperturaId: "ap",
      clausuraId: "cl",
      desempate: "cbf",
    })

    // Pontos somados iguais nos dois presets.
    expect(linhaDe(esp!.linhas, "A").pontos).toBe(6)
    expect(linhaDe(esp!.linhas, "B").pontos).toBe(6)
    // Espanhol: A à frente de B pelo confronto direto do ano (mini 6×0).
    expect(linhaDe(esp!.linhas, "A").posicao).toBe(1)
    expect(linhaDe(esp!.linhas, "B").posicao).toBe(2)
    // cbf: B à frente de A pelo saldo global.
    expect(linhaDe(cbf!.linhas, "B").posicao).toBe(1)
    expect(linhaDe(cbf!.linhas, "A").posicao).toBe(2)
  })

  it("W.O. ASSIMÉTRICO na Clausura: re-chaveia o wo_vencedor (credita o competidor certo)", async () => {
    // Sem o re-key do wo_vencedor, computeStandings cairia no lado2 em silêncio
    // (vencedor não casa o lado1 re-chaveado) e creditaria o PERDEDOR.
    const r = await getDivisionClassificacaoCombinada(
      fakeSupabase({
        tournaments: torneios(),
        slots: [
          apSlot("A", "Alpha"),
          apSlot("B", "Beta"),
          apSlot("C", "Cesar"),
          apSlot("D", "Delta"),
          clSlot("A"),
          clSlot("B"),
          clSlot("C"),
          clSlot("D"),
        ],
        matches: [
          wo("cl", "clS-A", "clS-B", "clS-A"), // A vence W.O. (vencedor = vaga_1)
          wo("cl", "clS-D", "clS-C", "clS-C"), // C vence W.O. (vencedor = vaga_2, ordem oposta)
        ],
      }),
      { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
    )
    expect(linhaDe(r!.linhas, "A").pontos).toBe(3)
    expect(linhaDe(r!.linhas, "B").pontos).toBe(0)
    expect(linhaDe(r!.linhas, "C").pontos).toBe(3)
    expect(linhaDe(r!.linhas, "D").pontos).toBe(0)
  })

  it("não-regressão: Clausura sem partidas ⇒ combinada == Apertura sozinha", async () => {
    const r = await getDivisionClassificacaoCombinada(
      fakeSupabase({
        tournaments: torneios(),
        slots: [apSlot("A", "Alpha"), apSlot("B", "Beta"), clSlot("A"), clSlot("B")],
        matches: [m("ap", "apS-A", "apS-B", 3, 1)],
      }),
      { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
    )
    expect(linhaDe(r!.linhas, "A").pontos).toBe(3)
    expect(linhaDe(r!.linhas, "A").jogos).toBe(1)
    expect(linhaDe(r!.linhas, "B").pontos).toBe(0)
    expect(linhaDe(r!.linhas, "B").jogos).toBe(1)
  })

  it("endurecimento: wo_vencedor da Clausura que não casa o confronto re-chaveado ⇒ erro", async () => {
    await expect(
      getDivisionClassificacaoCombinada(
        fakeSupabase({
          tournaments: torneios(),
          slots: [
            apSlot("A", "Alpha"),
            apSlot("B", "Beta"),
            apSlot("C", "Cesar"),
            clSlot("A"),
            clSlot("B"),
            clSlot("C"),
          ],
          matches: [wo("cl", "clS-A", "clS-B", "clS-C")], // vencedor de fora do confronto
        }),
        { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
      )
    ).rejects.toThrow(/Inconsist/)
  })

  // §13.4 / task 5.1.3.3 — INVARIANTE IRREVERSÍVEL. O `confirmarFluxoTemporada`
  // persiste `pontos`/`jogos`/`posicao_final` a partir DESTA combinada; um valor
  // errado contamina o promédio plurianual de TODAS as temporadas futuras e é
  // irreversível (as partidas vivem em torneios distintos). A fonte tem de ser a
  // SOMA dos dois turnos — NUNCA um turno só, e a GRANDE FINAL (final_tournament_id)
  // JAMAIS entra no cálculo (decorativa: coroa o campeão, não move o sobe/cai).
  describe("invariante §13.4 — pontos/jogos/posição = soma dos 2 turnos, sem a final", () => {
    // Apertura e Clausura. Se a grande final fosse (erroneamente) contada, ela
    // viraria a tabela: a final dá a B uma goleada brutal sobre A, o que mudaria
    // pontos, jogos E posição de ambos. A combinada DEVE ignorá-la por completo.
    const cenario = {
      tournaments: [
        ...torneios(),
        // Torneio da grande final — NUNCA pedido pelo fetcher (não está em [ap,cl]).
        { id: "final", status: "ativo", pontos_vitoria: 3, pontos_empate: 1, pontos_derrota: 0 },
      ] as Torneio[],
      slots: [
        apSlot("A", "Alpha"),
        apSlot("B", "Beta"),
        clSlot("A"),
        clSlot("B"),
        // Slots da grande final (mata_mata de 2). Se entrassem, re-keariam por
        // competidor e contaminariam as linhas da combinada.
        { id: "finS-A", tournament_id: "final", competitor_id: "comp-A", rotulo: null, team: null },
        { id: "finS-B", tournament_id: "final", competitor_id: "comp-B", rotulo: null, team: null },
      ] as Slot[],
      matches: [
        m("ap", "apS-A", "apS-B", 1, 0), // A vence na Apertura (A 3 / B 0)
        m("cl", "clS-A", "clS-B", 2, 0), // A vence na Clausura (A 3 / B 0)
        // GRANDE FINAL, ida e volta, B atropela A. Se contada: B saltaria à frente
        // (mais pontos + mais 2 jogos cada). NÃO pode mexer em nada da combinada.
        m("final", "finS-A", "finS-B", 0, 5),
        m("final", "finS-B", "finS-A", 7, 0),
      ] as Partida[],
    }

    it("pontos/jogos da combinada == SOMA dos dois turnos (a final é ignorada)", async () => {
      const r = await getDivisionClassificacaoCombinada(fakeSupabaseFiltrante(cenario), {
        aperturaId: "ap",
        clausuraId: "cl",
        desempate: "cbf",
      })
      const a = linhaDe(r!.linhas, "A")
      const b = linhaDe(r!.linhas, "B")
      // Soma dos DOIS turnos: A 3+3=6 / B 0+0=0; 2 jogos cada (1 por turno).
      expect(a.pontos).toBe(6)
      expect(a.jogos).toBe(2)
      expect(a.posicao).toBe(1)
      expect(b.pontos).toBe(0)
      expect(b.jogos).toBe(2)
      expect(b.posicao).toBe(2)
      // Se a final tivesse entrado: A teria +2 jogos (4) e levado 0+12 gols, B
      // saltaria a 1º com +6 pontos. Nada disso aconteceu ⇒ final fora do cálculo.
      expect(a.jogos).not.toBe(4)
    })

    it("jogar/mudar a GRANDE FINAL não muda pontos/jogos/posição da combinada", async () => {
      // Mesma divisão, mas SEM nenhuma partida (nem torneio) de grande final.
      const semFinal = {
        tournaments: torneios(),
        slots: [apSlot("A", "Alpha"), apSlot("B", "Beta"), clSlot("A"), clSlot("B")],
        matches: cenario.matches.filter((p) => p.tournament_id !== "final"),
      }
      const comFinal = await getDivisionClassificacaoCombinada(
        fakeSupabaseFiltrante(cenario),
        { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
      )
      const semFinalR = await getDivisionClassificacaoCombinada(
        fakeSupabaseFiltrante(semFinal),
        { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
      )
      // O que `confirmarFluxoTemporada` persiste (pontos/jogos/posição) é
      // BYTE-IDÊNTICO com ou sem a grande final jogada — ela é decorativa.
      const projetar = (r: typeof comFinal) =>
        r!.linhas
          .map((l) => ({ id: l.participanteId, pontos: l.pontos, jogos: l.jogos, posicao: l.posicao }))
          .sort((x, y) => x.id.localeCompare(y.id))
      expect(projetar(comFinal)).toEqual(projetar(semFinalR))
    })
  })

  it("flags de encerramento + null em erro de IO", async () => {
    const flags = await getDivisionClassificacaoCombinada(
      fakeSupabase({
        tournaments: torneios("encerrado", "ativo"),
        slots: [apSlot("A", "Alpha"), apSlot("B", "Beta"), clSlot("A"), clSlot("B")],
        matches: [m("ap", "apS-A", "apS-B", 1, 0)],
      }),
      { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
    )
    expect(flags!.aperturaEncerrado).toBe(true)
    expect(flags!.clausuraEncerrado).toBe(false)

    const erro = await getDivisionClassificacaoCombinada(
      fakeSupabase({
        tournaments: torneios(),
        slots: [apSlot("A", "Alpha"), apSlot("B", "Beta"), clSlot("A"), clSlot("B")],
        matches: [],
        errOn: "matches",
      }),
      { aperturaId: "ap", clausuraId: "cl", desempate: "cbf" }
    )
    expect(erro).toBeNull()
  })
})
