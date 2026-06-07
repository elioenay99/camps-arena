import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from "next/cache"

import { encerrarTorneio, reabrirTorneio } from "@/actions/tournaments"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Linhas confirmadas pelo UPDATE (default: 1 linha = sucesso). */
  updateData?: { id: string }[] | null
  updateError?: boolean
  /** Lookup do torneio na reabertura (dono + encerrado, com formato). */
  torneio?: { id: string; formato: string } | null
  torneioError?: boolean
  /** Há partidas geradas (com rodada)? Alimenta a derivação do retorno. */
  jaGeradas?: boolean
  geradasError?: boolean
}

/**
 * Cliente falso para os dois lifecycles:
 *  - encerrarTorneio: update().eq().eq().neq().select() — spies nos filtros
 *    provam que dono e transição são conferidos por FILTRO.
 *  - reabrirTorneio: select do torneio (maybeSingle) → select de matches
 *    (.not + .limit, detecção de partidas geradas) → update confirmado.
 */
function montarClient(c: Cenario) {
  const filtroUpdateSpy = vi.fn()
  const updatePayloadSpy = vi.fn()
  const cadeiaUpdate = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroUpdateSpy("eq", col, val)
      return cadeiaUpdate
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filtroUpdateSpy("neq", col, val)
      return cadeiaUpdate
    }),
    select: vi.fn(async () => ({
      data: c.updateError ? null : (c.updateData ?? [{ id: TORNEIO }]),
      error: c.updateError ? { message: "down" } : null,
    })),
  }
  const updateSpy = vi.fn((payload: unknown) => {
    updatePayloadSpy(payload)
    return cadeiaUpdate
  })

  const filtroTorneioSpy = vi.fn()
  const cadeiaTorneioSelect = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroTorneioSpy("eq", col, val)
      return cadeiaTorneioSelect
    }),
    maybeSingle: vi.fn(async () => ({
      data: c.torneio ?? null,
      error: c.torneioError ? { message: "down" } : null,
    })),
  }

  const cadeiaMatches = {
    eq: vi.fn(() => cadeiaMatches),
    not: vi.fn(() => cadeiaMatches),
    limit: vi.fn(async () => ({
      data: c.geradasError ? null : c.jaGeradas ? [{ id: "m1" }] : [],
      error: c.geradasError ? { message: "down" } : null,
    })),
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments")
        return { update: updateSpy, select: vi.fn(() => cadeiaTorneioSelect) }
      return { select: vi.fn(() => cadeiaMatches) }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return { updateSpy, updatePayloadSpy, filtroUpdateSpy, filtroTorneioSpy }
}

beforeEach(() => vi.clearAllMocks())

describe("encerrarTorneio", () => {
  it("uuid inválido não toca o banco", async () => {
    const r = await encerrarTorneio("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem escrever", async () => {
    const { updateSpy } = montarClient({ user: null })
    const r = await encerrarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("encerra por FILTRO (dono + não-encerrado) e revalida as três rotas", async () => {
    const { updatePayloadSpy, filtroUpdateSpy } = montarClient({
      user: { id: DONO },
    })
    const r = await encerrarTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(updatePayloadSpy).toHaveBeenCalledWith({ status: "encerrado" })
    // Dono e transição conferidos por FILTRO — sem fetch prévio, sem oráculo.
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("0 linhas afetadas (alheio/inexistente/já encerrado) = resposta única", async () => {
    montarClient({ user: { id: DONO }, updateData: [] })
    const r = await encerrarTorneio(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, já encerrado ou você não é o dono dele.",
    })
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("erro do banco vira mensagem genérica", async () => {
    montarClient({ user: { id: DONO }, updateError: true })
    const r = await encerrarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
  })
})

describe("reabrirTorneio", () => {
  it("uuid inválido não toca o banco", async () => {
    const r = await reabrirTorneio("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem escrever", async () => {
    const { updateSpy } = montarClient({ user: null })
    const r = await reabrirTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("torneio não-encerrado/alheio/inexistente: resposta única por FILTRO", async () => {
    const { updateSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await reabrirTorneio(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, não encerrado ou você não é o dono dele.",
    })
    expect(updateSpy).not.toHaveBeenCalled()
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "status", "encerrado")
  })

  it("avulso volta a ATIVO sem consultar partidas", async () => {
    const { updatePayloadSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "avulso" },
    })
    const r = await reabrirTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(updatePayloadSpy).toHaveBeenCalledWith({ status: "ativo" })
  })

  it.each(["liga", "mata_mata"])(
    "formato gerado (%s) COM partidas geradas volta a ATIVO",
    async (formato) => {
      const { updatePayloadSpy } = montarClient({
        user: { id: DONO },
        torneio: { id: TORNEIO, formato },
        jaGeradas: true,
      })
      const r = await reabrirTorneio(TORNEIO)
      expect(r).toEqual({ ok: true })
      expect(updatePayloadSpy).toHaveBeenCalledWith({ status: "ativo" })
    }
  )

  it.each(["liga", "mata_mata"])(
    "formato gerado (%s) SEM partidas geradas volta a RASCUNHO (nunca ativo sem tabela/chave)",
    async (formato) => {
      const { updatePayloadSpy } = montarClient({
        user: { id: DONO },
        torneio: { id: TORNEIO, formato },
        jaGeradas: false,
      })
      const r = await reabrirTorneio(TORNEIO)
      expect(r).toEqual({ ok: true })
      expect(updatePayloadSpy).toHaveBeenCalledWith({ status: "rascunho" })
    }
  )

  it("erro na detecção de partidas geradas vira mensagem genérica, sem escrever", async () => {
    const { updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "liga" },
      geradasError: true,
    })
    const r = await reabrirTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("0 linhas no UPDATE (corrida) pede recarga", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "avulso" },
      updateData: [],
    })
    const r = await reabrirTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/recarregue/i)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})
