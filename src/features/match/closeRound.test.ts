import { beforeEach, describe, expect, it, vi } from "vitest"

import { varrerOrfaosDaRodada } from "@/features/match/closeRound"

const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface PartidaRow {
  id: string
  posicao: number | null
  vaga_1: string | null
  vaga_2: string | null
  v1: { user_id: string | null } | null
  v2: { user_id: string | null } | null
}

interface Cenario {
  abertas: PartidaRow[]
  selectError?: boolean
  updateError?: boolean
}

/**
 * Cliente falso da varredura. Em `matches` distingue:
 *  - select(...).eq(tournament).eq(rodada).neq(status) → leitura (terminal neq)
 *  - update(...).eq(id).neq(status).select(id)         → W.O. (terminal select)
 * O updateSpy captura cada payload de W.O. gravado.
 */
function montarClient(c: Cenario) {
  const updateSpy = vi.fn()
  const updateFiltroSpy = vi.fn()

  const matchesFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.neq = vi.fn(async () => ({
        data: c.selectError ? null : c.abertas,
        error: c.selectError ? { message: "down" } : null,
      }))
      return cadeia
    }),
    update: vi.fn((vals: unknown) => {
      updateSpy(vals)
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn((col: string, val: unknown) => {
        updateFiltroSpy("eq", col, val)
        return cadeia
      })
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.select = vi.fn(async () => ({
        data: c.updateError ? null : [{ id: "x" }],
        error: c.updateError ? { message: "rls" } : null,
      }))
      return cadeia
    }),
  }

  const client = {
    from: vi.fn(() => matchesFrom),
    updateSpy,
    updateFiltroSpy,
  }
  return client
}

// Atalhos de partida (posicao null = FORA de chave = liga/grupos).
const orfaoXtecnico = (id: string): PartidaRow => ({
  id,
  posicao: null,
  vaga_1: `${id}-s1`,
  vaga_2: `${id}-s2`,
  v1: { user_id: null }, // órfão
  v2: { user_id: "tec" }, // com técnico
})
const tecnicoXorfao = (id: string): PartidaRow => ({
  id,
  posicao: null,
  vaga_1: `${id}-s1`,
  vaga_2: `${id}-s2`,
  v1: { user_id: "tec" },
  v2: { user_id: null },
})
const jogavel = (id: string): PartidaRow => ({
  id,
  posicao: null,
  vaga_1: `${id}-s1`,
  vaga_2: `${id}-s2`,
  v1: { user_id: "t1" },
  v2: { user_id: "t2" },
})
const orfaoXorfao = (id: string): PartidaRow => ({
  id,
  posicao: null,
  vaga_1: `${id}-s1`,
  vaga_2: `${id}-s2`,
  v1: { user_id: null },
  v2: { user_id: null },
})
// Órfão × órfão EM chave (posicao não nula): duplo é PROIBIDO — fica intocado.
const orfaoXorfaoChave = (id: string): PartidaRow => ({
  id,
  posicao: 1,
  vaga_1: `${id}-s1`,
  vaga_2: `${id}-s2`,
  v1: { user_id: null },
  v2: { user_id: null },
})

beforeEach(() => vi.clearAllMocks())

describe("varrerOrfaosDaRodada", () => {
  it("marca W.O. em órfão×técnico (vencedor = o lado COM técnico)", async () => {
    const client = montarClient({ abertas: [orfaoXtecnico("m1")] })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(1)
    expect(client.updateSpy).toHaveBeenCalledWith({
      wo: true,
      wo_vencedor: "m1-s2", // o lado 2 tem técnico → vence
      placar_1: 0,
      placar_2: 0,
      status: "encerrada",
    })
    // Filtrado por id + não-encerrada (corrida).
    expect(client.updateFiltroSpy).toHaveBeenCalledWith("eq", "id", "m1")
  })

  it("lado 1 com técnico, lado 2 órfão → vencedor é o lado 1", async () => {
    const client = montarClient({ abertas: [tecnicoXorfao("m1")] })
    await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(client.updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wo_vencedor: "m1-s1" })
    )
  })

  it("NÃO toca partida jogável (ambos com técnico)", async () => {
    const client = montarClient({ abertas: [jogavel("m1")] })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(0)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("órfão×órfão FORA de chave vira DUPLO W.O. (sem vencedor, 0x0)", async () => {
    const client = montarClient({ abertas: [orfaoXorfao("m1")] })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(1)
    expect(client.updateSpy).toHaveBeenCalledWith({
      wo: true,
      wo_duplo: true,
      wo_vencedor: null,
      placar_1: 0,
      placar_2: 0,
      status: "encerrada",
    })
    expect(client.updateFiltroSpy).toHaveBeenCalledWith("eq", "id", "m1")
  })

  it("órfão×órfão EM chave (posicao != null) NÃO é tocado (a chave exige vencedor)", async () => {
    const client = montarClient({ abertas: [orfaoXorfaoChave("m1")] })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(0)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("bye (vaga_2 null) não é tocado", async () => {
    const bye: PartidaRow = {
      id: "m1",
      posicao: null,
      vaga_1: "s1",
      vaga_2: null,
      v1: { user_id: "tec" },
      v2: null,
    }
    const client = montarClient({ abertas: [bye] })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(0)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("somenteSeRodadaCompleta: NÃO varre se ainda há jogo jogável aberto", async () => {
    const client = montarClient({
      abertas: [orfaoXtecnico("m1"), jogavel("m2")],
    })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1, {
      somenteSeRodadaCompleta: true,
    })
    expect(r.marcadas).toBe(0)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("somenteSeRodadaCompleta: varre quando só restam órfãs", async () => {
    const client = montarClient({
      abertas: [orfaoXtecnico("m1"), orfaoXorfao("m2")],
    })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1, {
      somenteSeRodadaCompleta: true,
    })
    // m1 vira W.O. simples; m2 (órfão×órfão fora de chave) vira DUPLO W.O.
    expect(r.marcadas).toBe(2)
    expect(client.updateSpy).toHaveBeenCalledTimes(2)
  })

  it("manual (sem flag): varre órfãs mesmo com jogável aberta", async () => {
    const client = montarClient({
      abertas: [orfaoXtecnico("m1"), jogavel("m2")],
    })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(1) // só a órfã; a jogável fica aberta
    expect(client.updateSpy).toHaveBeenCalledTimes(1)
  })

  it("marca VÁRIAS órfãs numa rodada", async () => {
    const client = montarClient({
      abertas: [orfaoXtecnico("m1"), tecnicoXorfao("m2")],
    })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(2)
    expect(client.updateSpy).toHaveBeenCalledTimes(2)
  })

  it("erro no select: retorna marcadas 0 sem escrever (best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = montarClient({ abertas: [], selectError: true })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(0)
    expect(client.updateSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("erro no UPDATE de uma órfã não conta como marcada (best-effort)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const client = montarClient({
      abertas: [orfaoXtecnico("m1")],
      updateError: true,
    })
    const r = await varrerOrfaosDaRodada(client as never, TORNEIO, 1)
    expect(r.marcadas).toBe(0)
    consoleSpy.mockRestore()
  })
})
