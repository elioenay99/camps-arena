import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// fecharRodada delega a varredura — mockada (cobertura própria em
// closeRound.test.ts); aqui só verificamos a orquestração.
vi.mock("@/features/match/closeRound", () => ({
  varrerOrfaosDaRodada: vi.fn(async () => ({ marcadas: 2 })),
}))

import { varrerOrfaosDaRodada } from "@/features/match/closeRound"
import { fecharRodada, marcarWO, responderWO, solicitarWO } from "@/actions/wo"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockVarrer = vi.mocked(varrerOrfaosDaRodada)

const MATCH = "11111111-1111-4111-8111-111111111111"
const TORNEIO = "22222222-2222-4222-8222-222222222222"
const DONO = "33333333-3333-4333-8333-333333333333"
const VAGA_1 = "44444444-4444-4444-8444-444444444444"
const VAGA_2 = "55555555-5555-4555-8555-555555555555"
const REQUEST = "66666666-6666-4666-8666-666666666666"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  match?: Record<string, unknown> | null
  matchError?: boolean
  torneio?: { id: string } | null
  torneioError?: boolean
  matchUpdateData?: { id: string }[] | null
  matchUpdateError?: boolean
  /** Guard de chave: partidas de fase POSTERIOR (fase congelada). */
  posteriores?: { id: string }[]
  /** Guard de chave: outra perna do confronto já encerrada por W.O. */
  pernaIrma?: { id: string }[]
  requisicao?: Record<string, unknown> | null
  reqError?: boolean
  requestUpdateData?: { id: string; match_id: string }[] | null
  requestUpdateError?: boolean
  insertError?: boolean
  insertCode?: string
}

function montarClient(cfg: Cenario) {
  const matchUpdateSpy = vi.fn()
  const requestInsertSpy = vi.fn()
  const requestUpdateSpy = vi.fn()
  const tournamentFiltroSpy = vi.fn()

  const matchesFrom = {
    select: vi.fn(() => {
      // Três usos: fetch primário (.eq.maybeSingle → cfg.match) e os dois
      // guards de chave, ambos terminando em .limit(1). Distinguimos pelo .gt
      // (só a query de fase posterior usa) — sibling-W.O. usa .neq.
      const cadeia: Record<string, unknown> = {}
      let usouGt = false
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.not = vi.fn(() => cadeia)
      cadeia.gt = vi.fn(() => {
        usouGt = true
        return cadeia
      })
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.limit = vi.fn(async () => ({
        data: usouGt ? (cfg.posteriores ?? []) : (cfg.pernaIrma ?? []),
        error: null,
      }))
      cadeia.maybeSingle = vi.fn(async () => ({
        data: cfg.match ?? null,
        error: cfg.matchError ? { message: "down" } : null,
      }))
      return cadeia
    }),
    update: vi.fn((v: unknown) => {
      matchUpdateSpy(v)
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.select = vi.fn(async () => ({
        data: cfg.matchUpdateError ? null : (cfg.matchUpdateData ?? [{ id: MATCH }]),
        error: cfg.matchUpdateError ? { message: "rls" } : null,
      }))
      return cadeia
    }),
  }

  const tournamentsFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn((col: string, val: unknown) => {
        tournamentFiltroSpy("eq", col, val)
        return cadeia
      })
      cadeia.maybeSingle = vi.fn(async () => ({
        data: cfg.torneio ?? null,
        error: cfg.torneioError ? { message: "down" } : null,
      }))
      return cadeia
    }),
  }

  const requestsFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({
        data: cfg.requisicao ?? null,
        error: cfg.reqError ? { message: "down" } : null,
      }))
      return cadeia
    }),
    insert: vi.fn(async (v: unknown) => {
      requestInsertSpy(v)
      return {
        error: cfg.insertError
          ? { message: "e", code: cfg.insertCode ?? "23505" }
          : null,
      }
    }),
    update: vi.fn((v: unknown) => {
      requestUpdateSpy(v)
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.select = vi.fn(async () => ({
        data: cfg.requestUpdateError
          ? null
          : (cfg.requestUpdateData ?? [{ id: REQUEST, match_id: MATCH }]),
        error: cfg.requestUpdateError ? { message: "e" } : null,
      }))
      return cadeia
    }),
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: cfg.user ?? null },
        error: cfg.authError ? { message: "jwt" } : null,
      })),
    },
    from: vi.fn((t: string) =>
      t === "matches"
        ? matchesFrom
        : t === "tournaments"
          ? tournamentsFrom
          : requestsFrom
    ),
    matchUpdateSpy,
    requestInsertSpy,
    requestUpdateSpy,
    tournamentFiltroSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

const partidaAberta = (over: Record<string, unknown> = {}) => ({
  id: MATCH,
  status: "agendada",
  tournament_id: TORNEIO,
  vaga_1: VAGA_1,
  vaga_2: VAGA_2,
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("marcarWO", () => {
  it("ids inválidos rejeitam sem tocar o banco", async () => {
    expect(await marcarWO("lixo", VAGA_1)).toEqual({ ok: false, error: "Dados inválidos." })
    expect(await marcarWO(MATCH, "lixo")).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const c = montarClient({ user: null })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("não-dono (torneio não-ativo/alheio) recebe resposta de propriedade", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: null,
    })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
    // Propriedade + estado ATIVO por filtro.
    expect(c.tournamentFiltroSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(c.tournamentFiltroSpy).toHaveBeenCalledWith("eq", "status", "ativo")
  })

  it("partida já encerrada é recusada (corrigir = reabrir antes)", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "encerrada" }),
      torneio: { id: TORNEIO },
    })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já está encerrada/i)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("vencedor fora dos lados da partida é recusado", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    const r = await marcarWO(MATCH, "99999999-9999-4999-8999-999999999999")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/um dos clubes/i)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("sucesso: grava W.O. (0x0, vencedor, encerrada) no lado apontado", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    const r = await marcarWO(MATCH, VAGA_2)
    expect(r).toEqual({ ok: true })
    expect(c.matchUpdateSpy).toHaveBeenCalledWith({
      wo: true,
      wo_vencedor: VAGA_2,
      placar_1: 0,
      placar_2: 0,
      status: "encerrada",
    })
  })

  it("0 linhas no UPDATE (corrida) vira mensagem de recarregar", async () => {
    montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
      matchUpdateData: [],
    })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/recarregue/i)
  })

  it("W.O. em fase de chave já congelada (fase seguinte gerada) é recusado", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ posicao: 1, rodada: 1, perna: null }),
      torneio: { id: TORNEIO },
      posteriores: [{ id: "fase-2" }], // já existe fase posterior → congelada
    })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/congelada/i)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("W.O. na perna restante de um confronto já decidido por W.O. é recusado", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ posicao: 1, rodada: 2, perna: 2 }),
      torneio: { id: TORNEIO },
      posteriores: [], // fase atual
      pernaIrma: [{ id: "ida" }], // a ida do confronto já é W.O.
    })
    const r = await marcarWO(MATCH, VAGA_1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/outra perna/i)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("W.O. permitido em partida de chave da fase atual (sem posterior nem perna-irmã W.O.)", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ posicao: 1, rodada: 2, perna: 2 }),
      torneio: { id: TORNEIO },
      posteriores: [],
      pernaIrma: [], // a outra perna não é W.O. (resultado normal ou ainda aberta)
    })
    const r = await marcarWO(MATCH, VAGA_2)
    expect(r).toEqual({ ok: true })
    expect(c.matchUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        wo: true,
        wo_vencedor: VAGA_2,
        status: "encerrada",
      })
    )
  })
})

describe("fecharRodada", () => {
  it("rodada inválida rejeita sem tocar o banco", async () => {
    expect(await fecharRodada(TORNEIO, 0)).toEqual({ ok: false, error: "Dados inválidos." })
    expect(await fecharRodada("lixo", 1)).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("não-dono não fecha e não varre", async () => {
    montarClient({ user: { id: DONO }, torneio: null })
    const r = await fecharRodada(TORNEIO, 1)
    expect(r.ok).toBe(false)
    expect(mockVarrer).not.toHaveBeenCalled()
  })

  it("dono fecha: varre a rodada e devolve o nº de W.O. marcados", async () => {
    montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    const r = await fecharRodada(TORNEIO, 3)
    expect(r).toEqual({ ok: true, marcadas: 2 })
    expect(mockVarrer).toHaveBeenCalledWith(expect.anything(), TORNEIO, 3)
  })
})

describe("solicitarWO", () => {
  it("uuid inválido rejeita sem tocar o banco", async () => {
    expect(await solicitarWO("lixo")).toEqual({ ok: false, error: "Partida inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("partida encerrada recusa", async () => {
    const c = montarClient({
      user: { id: "tec" },
      match: { ...partidaAberta({ status: "encerrada" }), v1: { user_id: "tec" }, v2: { user_id: "x" } },
    })
    const r = await solicitarWO(MATCH)
    expect(r.ok).toBe(false)
    expect(c.requestInsertSpy).not.toHaveBeenCalled()
  })

  it("quem não joga a partida é recusado (não é técnico de nenhum lado)", async () => {
    const c = montarClient({
      user: { id: "estranho" },
      match: { ...partidaAberta(), v1: { user_id: "tecA" }, v2: { user_id: "tecB" } },
    })
    const r = await solicitarWO(MATCH)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não joga/i)
    expect(c.requestInsertSpy).not.toHaveBeenCalled()
  })

  it("sucesso: insere a solicitação com o PRÓPRIO slot como solicitante", async () => {
    const c = montarClient({
      user: { id: "tecB" },
      match: { ...partidaAberta(), v1: { user_id: "tecA" }, v2: { user_id: "tecB" } },
    })
    const r = await solicitarWO(MATCH)
    expect(r).toEqual({ ok: true })
    expect(c.requestInsertSpy).toHaveBeenCalledWith({
      match_id: MATCH,
      solicitante_slot: VAGA_2, // tecB comanda a vaga_2
    })
  })

  it("colisão de pendente (23505) vira mensagem de já existente", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({
      user: { id: "tecA" },
      match: { ...partidaAberta(), v1: { user_id: "tecA" }, v2: { user_id: "tecB" } },
      insertError: true,
      insertCode: "23505",
    })
    const r = await solicitarWO(MATCH)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/pendente/i)
    consoleSpy.mockRestore()
  })
})

describe("responderWO", () => {
  const pendente = {
    id: REQUEST,
    match_id: MATCH,
    solicitante_slot: VAGA_1,
    status: "pendente",
  }

  it("dados inválidos rejeitam", async () => {
    expect(await responderWO("lixo", true)).toEqual({ ok: false, error: "Dados inválidos." })
    expect(await responderWO(REQUEST, "sim" as unknown)).toEqual({
      ok: false,
      error: "Dados inválidos.",
    })
  })

  it("solicitação inexistente/já resolvida é recusada", async () => {
    montarClient({ user: { id: DONO }, requisicao: null })
    const r = await responderWO(REQUEST, true)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrada|resolvida/i)
  })

  it("ACEITAR marca a partida W.O. a favor do solicitante e resolve a solicitação", async () => {
    const c = montarClient({
      user: { id: DONO },
      requisicao: pendente,
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    const r = await responderWO(REQUEST, true)
    expect(r).toEqual({ ok: true })
    // partida vira W.O. com vencedor = solicitante (VAGA_1).
    expect(c.matchUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ wo: true, wo_vencedor: VAGA_1, status: "encerrada" })
    )
    // solicitação resolvida como aceita.
    expect(c.requestUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "aceito" })
    )
  })

  it("RECUSAR não marca a partida e resolve como recusada", async () => {
    const c = montarClient({
      user: { id: DONO },
      requisicao: pendente,
      match: { tournament_id: TORNEIO },
    })
    const r = await responderWO(REQUEST, false)
    expect(r).toEqual({ ok: true })
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
    expect(c.requestUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: "recusado" })
    )
  })

  it("ACEITAR com a partida já encerrada NÃO resolve a solicitação (falha-segura)", async () => {
    const c = montarClient({
      user: { id: DONO },
      requisicao: pendente,
      match: partidaAberta({ status: "encerrada" }),
      torneio: { id: TORNEIO },
    })
    const r = await responderWO(REQUEST, true)
    expect(r.ok).toBe(false)
    expect(c.requestUpdateSpy).not.toHaveBeenCalled()
  })
})
