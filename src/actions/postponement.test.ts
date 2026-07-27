import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/features/notifications/enviar", () => ({ enviarNotificacoes: vi.fn() }))

import { adiarPartida, desfazerAdiamento } from "@/actions/postponement"
import { enviarNotificacoes } from "@/features/notifications/enviar"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockNotificar = vi.mocked(enviarNotificacoes)

const MATCH = "11111111-1111-4111-8111-111111111111"
const TORNEIO = "22222222-2222-4222-8222-222222222222"
const DONO = "33333333-3333-4333-8333-333333333333"
const TECNICO_1 = "44444444-4444-4444-8444-444444444444"
const TECNICO_2 = "55555555-5555-4555-8555-555555555555"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  match?: Record<string, unknown> | null
  matchError?: boolean
  torneio?: { id: string } | null
  torneioError?: boolean
  negarCapacidade?: boolean
  rpcAdiarError?: { message: string } | null
  matchUpdateData?: { id: string }[] | null
  matchUpdateError?: boolean
}

function montarClient(cfg: Cenario) {
  const matchUpdateSpy = vi.fn()
  const rpcAdiarSpy = vi.fn()
  const tournamentFiltroSpy = vi.fn()

  const matchesFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
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
      cadeia.neq = vi.fn((col: string, val: unknown) => {
        tournamentFiltroSpy("neq", col, val)
        return cadeia
      })
      cadeia.maybeSingle = vi.fn(async () => ({
        data: cfg.torneio ?? null,
        error: cfg.torneioError ? { message: "down" } : null,
      }))
      return cadeia
    }),
  }

  const client = {
    rpc: vi.fn((fn: string, args: unknown) => {
      if (fn === "pode_arbitrar_torneio") {
        return Promise.resolve({ data: cfg.negarCapacidade ? false : true, error: null })
      }
      if (fn === "adiar_partida") {
        rpcAdiarSpy(args)
        return Promise.resolve({
          data: cfg.rpcAdiarError ? null : MATCH,
          error: cfg.rpcAdiarError ?? null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: cfg.user ?? null },
        error: cfg.authError ? { message: "jwt" } : null,
      })),
    },
    from: vi.fn((t: string) => (t === "matches" ? matchesFrom : tournamentsFrom)),
    matchUpdateSpy,
    rpcAdiarSpy,
    tournamentFiltroSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

/** Superset de campos: cobre tanto o fetch de pré-check quanto o de notificação. */
const partidaAberta = (over: Record<string, unknown> = {}) => ({
  id: MATCH,
  status: "em_andamento",
  tournament_id: TORNEIO,
  posicao: null,
  tournaments: { titulo: "Liga Teste" },
  v1: { user_id: TECNICO_1 },
  v2: { user_id: TECNICO_2 },
  ...over,
})

beforeEach(() => vi.clearAllMocks())

describe("adiarPartida", () => {
  it("dados inválidos rejeitam sem tocar o banco", async () => {
    expect(await adiarPartida("lixo")).toEqual({ ok: false, error: "Dados inválidos." })
    expect(await adiarPartida(MATCH, "x".repeat(281))).toEqual({
      ok: false,
      error: "Dados inválidos.",
    })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const c = montarClient({ user: null })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(false)
    expect(c.rpcAdiarSpy).not.toHaveBeenCalled()
  })

  it("sem capacidade ARBITRAR: recusa sem chamar a RPC", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
      negarCapacidade: true,
    })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(false)
    expect(c.rpcAdiarSpy).not.toHaveBeenCalled()
  })

  it("torneio não-ativo: recusa", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: null,
    })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(false)
    expect(c.tournamentFiltroSpy).toHaveBeenCalledWith("eq", "status", "ativo")
    expect(c.rpcAdiarSpy).not.toHaveBeenCalled()
  })

  it("partida já encerrada é recusada", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "encerrada" }),
      torneio: { id: TORNEIO },
    })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já está encerrada/i)
    expect(c.rpcAdiarSpy).not.toHaveBeenCalled()
  })

  it("partida de chave (posicao não nula) é recusada", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ posicao: 1 }),
      torneio: { id: TORNEIO },
    })
    const r = await adiarPartida(MATCH, "motivo qualquer")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/chave/i)
    expect(c.rpcAdiarSpy).not.toHaveBeenCalled()
  })

  it("sucesso: chama a RPC com o motivo e notifica os dois técnicos, excluindo o caller", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    const r = await adiarPartida(MATCH, "  chuva forte  ")
    expect(r.ok).toBe(true)
    expect(c.rpcAdiarSpy).toHaveBeenCalledWith({
      p_match_id: MATCH,
      p_motivo: "chuva forte",
    })
    expect(mockNotificar).toHaveBeenCalledTimes(1)
    const [, destinatarios, payload, callerId] = mockNotificar.mock.calls[0]
    expect(destinatarios).toEqual([TECNICO_1, TECNICO_2])
    expect(callerId).toBe(DONO)
    expect(payload.body).toMatch(/chuva forte/)
  })

  it("motivo vazio vira undefined (não bloqueia) e RPC recebe p_motivo nulo", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(true)
    expect(c.rpcAdiarSpy).toHaveBeenCalledWith({ p_match_id: MATCH, p_motivo: null })
  })

  it("erro da RPC (corrida) é mapeado para mensagem pt-BR", async () => {
    montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
      rpcAdiarError: { message: "PARTIDA_INDISPONIVEL" },
    })
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/alterada/i)
  })

  it("falha na notificação (best-effort) NÃO derruba o sucesso do adiamento", async () => {
    montarClient({
      user: { id: DONO },
      match: partidaAberta(),
      torneio: { id: TORNEIO },
    })
    mockNotificar.mockRejectedValueOnce(new Error("push indisponível"))
    const r = await adiarPartida(MATCH)
    expect(r.ok).toBe(true)
  })
})

describe("desfazerAdiamento", () => {
  it("id inválido rejeita sem tocar o banco", async () => {
    expect(await desfazerAdiamento("lixo")).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const c = montarClient({ user: null })
    const r = await desfazerAdiamento(MATCH)
    expect(r.ok).toBe(false)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("sem capacidade ARBITRAR: recusa", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "adiada" }),
      torneio: { id: TORNEIO },
      negarCapacidade: true,
    })
    const r = await desfazerAdiamento(MATCH)
    expect(r.ok).toBe(false)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("torneio encerrado (congelado): recusa", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "adiada" }),
      torneio: null,
    })
    const r = await desfazerAdiamento(MATCH)
    expect(r.ok).toBe(false)
    expect(c.tournamentFiltroSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("partida que não está adiada é recusada", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "em_andamento" }),
      torneio: { id: TORNEIO },
    })
    const r = await desfazerAdiamento(MATCH)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não está adiada/i)
    expect(c.matchUpdateSpy).not.toHaveBeenCalled()
  })

  it("sucesso: volta a em_andamento e limpa os três campos", async () => {
    const c = montarClient({
      user: { id: DONO },
      match: partidaAberta({ status: "adiada" }),
      torneio: { id: TORNEIO },
    })
    const r = await desfazerAdiamento(MATCH)
    expect(r.ok).toBe(true)
    expect(c.matchUpdateSpy).toHaveBeenCalledWith({
      status: "em_andamento",
      adiada_em: null,
      adiada_por: null,
      adiamento_motivo: null,
    })
  })
})
