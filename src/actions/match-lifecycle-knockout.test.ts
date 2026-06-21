import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Fechamento automático de rodada: secundário ao encerramento, cobertura
// própria em closeRound.test.ts — no-op aqui.
vi.mock("@/features/match/closeRound", () => ({
  varrerOrfaosDaRodada: vi.fn(async () => ({ marcadas: 0 })),
}))

import { encerrarPartida, reabrirPartida } from "@/actions/match"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const PARTIDA = "11111111-1111-4111-8111-111111111111"
const TORNEIO = "22222222-2222-4222-8222-222222222222"
const DONO = "33333333-3333-4333-8333-333333333333"
const JOG_A = "44444444-4444-4444-8444-444444444444"
const JOG_B = "55555555-5555-4555-8555-555555555555"

/** Partida de mata-mata: o select traz os insumos das regras de eliminatória. */
interface MatchMataMata {
  id: string
  status: string
  tournament_id: string
  rodada: number | null
  posicao: number | null
  perna: number | null
  participante_1: string | null
  participante_2: string | null
  placar_1: number
  placar_2: number
}

interface Cenario {
  user?: { id: string } | null
  match?: MatchMataMata | null
  /** Formato do torneio (mata_mata dispara a validação extra). */
  formato?: string
  torneio?: { id: string; formato: string } | null
  /**
   * Resultado da query auxiliar dentro de validarLifecycleMataMata:
   *  - ao encerrar perna 2: o jogo de ida (.maybeSingle()).
   *  - ao reabrir: as partidas de fases posteriores (.limit(1)).
   */
  aux?: unknown
  auxError?: boolean
  /** Resultado do UPDATE final. */
  updateData?: { id: string }[] | null
}

/**
 * Cliente falso que distingue, na MESMA tabela `matches`, três interações:
 *  - 1º select → leitura da partida (termina em .maybeSingle()).
 *  - 2º select → query auxiliar de validarLifecycleMataMata (ida ou posteriores).
 *  - update    → escrita de status (capturada pelo updateSpy).
 * A cadeia é tolerante a eq/gt/limit/maybeSingle em qualquer ordem; o que define
 * o dado devolvido é a ORDEM da chamada de select (1ª = partida, 2ª = auxiliar),
 * espelhando a sequência real da action.
 */
function montarClient(c: Cenario) {
  const updateSpy = vi.fn()
  let matchesSelectCount = 0

  const torneioPadrao =
    c.torneio !== undefined
      ? c.torneio
      : { id: TORNEIO, formato: c.formato ?? "mata_mata" }

  const matchesFrom = {
    select: vi.fn(() => {
      matchesSelectCount += 1
      const ehPartida = matchesSelectCount === 1
      const cadeia: Record<string, unknown> = {}
      const terminalPartida = async () => ({
        data: c.match ?? null,
        error: null,
      })
      const terminalAux = async () => ({
        data: c.auxError ? null : (c.aux ?? null),
        error: c.auxError ? { message: "down" } : null,
      })
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.gt = vi.fn(() => cadeia)
      cadeia.not = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(ehPartida ? terminalPartida : terminalAux)
      cadeia.limit = vi.fn(terminalAux)
      return cadeia
    }),
    update: vi.fn((vals: unknown) => {
      updateSpy(vals)
      // Cadeia encadeável: a guarda otimista de status usa .eq().neq()/.eq()
      // antes do .select() (fecha a corrida de reabrir↔encerrar).
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.select = vi.fn(async () => ({
        data: c.updateData ?? [{ id: PARTIDA }],
        error: null,
      }))
      return cadeia
    }),
  }

  const torneioFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({
        data: torneioPadrao,
        error: null,
      }))
      return cadeia
    }),
  }

  const client = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? { id: DONO } },
        error: null,
      })),
    },
    from: vi.fn((tabela: string) =>
      tabela === "tournaments" ? torneioFrom : matchesFrom
    ),
    updateSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

/** Partida de mata-mata com defaults sensatos (jogo único, ambos os lados). */
function partida(over: Partial<MatchMataMata> = {}): MatchMataMata {
  return {
    id: PARTIDA,
    status: "em_andamento",
    tournament_id: TORNEIO,
    rodada: 1,
    posicao: 1,
    perna: null,
    participante_1: JOG_A,
    participante_2: JOG_B,
    placar_1: 2,
    placar_2: 1,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("encerrarPartida — regras de mata-mata (jogo único)", () => {
  it("jogo único empatado é rejeitado e o UPDATE não roda (eliminatória não empata)", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: null, placar_1: 1, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/empatado/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("jogo único com vencedor encerra normalmente (UPDATE de status roda)", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: null, placar_1: 3, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })
})

describe("encerrarPartida — regras de mata-mata (ida e volta)", () => {
  it("a perna 1 (ida) pode terminar empatada: o agregado decide na volta", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: 1, placar_1: 1, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("re-encerrar a ida com a volta JÁ fechada e agregado empatado é barrado", async () => {
    // Fluxo reabrir→corrigir→re-encerrar a ida com a volta já encerrada.
    // Ida corrigida 1x0; volta 1x0 (lados invertidos, B venceu a volta):
    // A = ida.placar_1 + volta.placar_2 = 1 + 0 = 1
    // B = ida.placar_2 + volta.placar_1 = 0 + 1 = 1 — slot ficaria
    // "fechado" empatado sem este guard.
    const { updateSpy } = montarClient({
      match: partida({ perna: 1, placar_1: 1, placar_2: 0 }),
      aux: { status: "encerrada", placar_1: 1, placar_2: 0 },
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/[Aa]gregado/)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("re-encerrar a ida com a volta fechada e agregado DESEMPATADO passa", async () => {
    // Ida corrigida para 2x0; volta 1x0 invertida: A = 2+0 = 2, B = 0+1 = 1.
    const { updateSpy } = montarClient({
      match: partida({ perna: 1, placar_1: 2, placar_2: 0 }),
      aux: { status: "encerrada", placar_1: 1, placar_2: 0 },
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("encerrar a volta com a ida ainda não encerrada é barrado (ordem da eliminatória)", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: 2, placar_1: 0, placar_2: 1 }),
      aux: { status: "em_andamento", placar_1: 0, placar_2: 0 },
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ida antes/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("encerrar a volta sem registro de ida (maybeSingle null) é barrado pela mesma regra", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: 2, placar_1: 1, placar_2: 0 }),
      aux: null,
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ida antes/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("agregado empatado (lados invertidos na volta) exige decisão e bloqueia o encerramento", async () => {
    // A volta inverte os mandos: agregado de A = ida.placar_1 + volta.placar_2,
    // agregado de B = ida.placar_2 + volta.placar_1. Ida 1x0 e volta 1x0 →
    // A = 1 + 0 = 1 e B = 0 + 1 = 1: empate agregado, sem vencedor.
    const { updateSpy } = montarClient({
      match: partida({ perna: 2, placar_1: 1, placar_2: 0 }),
      aux: { status: "encerrada", placar_1: 1, placar_2: 0 },
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/[Aa]gregado/)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("agregado desempatado encerra a volta normalmente", async () => {
    // Ida 2x0 e volta 1x0 (lados invertidos): A = ida.placar_1 + volta.placar_2 =
    // 2 + 0 = 2; B = ida.placar_2 + volta.placar_1 = 0 + 1 = 1. A vence, passa.
    const { updateSpy } = montarClient({
      match: partida({ perna: 2, placar_1: 1, placar_2: 0 }),
      aux: { status: "encerrada", placar_1: 2, placar_2: 0 },
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("erro na query da ida vira mensagem genérica de validação, sem UPDATE", async () => {
    const { updateSpy } = montarClient({
      match: partida({ perna: 2, placar_1: 1, placar_2: 0 }),
      auxError: true,
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível validar/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("reabrirPartida — regras de mata-mata", () => {
  it("bye (participante_2 null) nunca reabre: não há placar a corrigir", async () => {
    const { updateSpy } = montarClient({
      match: partida({ status: "encerrada", participante_2: null }),
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/bye/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("reabrir uma fase já superada é barrado (a fase seguinte foi gerada)", async () => {
    const { updateSpy } = montarClient({
      match: partida({ status: "encerrada" }),
      aux: [{ id: "fase-posterior" }],
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/fase seguinte/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("sem fases posteriores a reabertura passa (UPDATE para em_andamento roda)", async () => {
    const { updateSpy } = montarClient({
      match: partida({ status: "encerrada" }),
      aux: [],
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "em_andamento", wo: false, wo_vencedor: null })
  })

  it("erro na query de posteriores vira mensagem genérica de validação, sem UPDATE", async () => {
    const { updateSpy } = montarClient({
      match: partida({ status: "encerrada" }),
      auxError: true,
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível validar/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("lifecycle de mata-mata só dispara em torneio mata_mata com rodada", () => {
  it("torneio liga: encerrar empatado passa (nenhuma regra de eliminatória)", async () => {
    const { updateSpy } = montarClient({
      formato: "liga",
      match: partida({ perna: null, placar_1: 1, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("torneio avulso: encerrar empatado passa (nenhuma regra de eliminatória)", async () => {
    const { updateSpy } = montarClient({
      formato: "avulso",
      match: partida({ perna: null, placar_1: 2, placar_2: 2 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("partida sem rodada em torneio mata_mata: encerrar empatado passa (não é da chave)", async () => {
    const { updateSpy } = montarClient({
      formato: "mata_mata",
      match: partida({ rodada: null, perna: null, placar_1: 1, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })
})

describe("formatos de grupos — lifecycle de partida de GRUPO", () => {
  it("encerrar jogo de GRUPO empatado passa (empate pontua na classificação)", async () => {
    const { updateSpy } = montarClient({
      formato: "grupos_mata_mata",
      match: partida({ posicao: null, perna: null, placar_1: 1, placar_2: 1 }),
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("reabrir jogo de GRUPO com o mata-mata já gerado é barrado com mensagem precisa", async () => {
    const { updateSpy } = montarClient({
      formato: "grupos_mata_mata",
      match: partida({ posicao: null, status: "encerrada" }),
      aux: [{ id: "partida-da-chave" }],
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/mata-mata já foi gerado/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("reabrir jogo de GRUPO antes da chave existir segue livre", async () => {
    const { updateSpy } = montarClient({
      formato: "fase_liga",
      match: partida({ posicao: null, status: "encerrada" }),
      aux: [],
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "em_andamento", wo: false, wo_vencedor: null })
  })
})
