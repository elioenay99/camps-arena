import { beforeEach, describe, expect, it, vi } from "vitest"

// Actions de toggle da vitrine (add-vitrine-publica-e-compartilhar): a
// autorização é `podeGerir` (mockado como interruptor do cenário) + a rejeição de
// DIVISÃO (via RPC `liga_do_torneio`). O fake do Supabase resolve auth/rpc/update.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/autorizacao", () => ({ podeGerir: vi.fn() }))

import { definirListadaTorneio } from "@/actions/tournaments"
import { definirListadaLiga } from "@/actions/leaguePyramid"
import { createClient } from "@/lib/supabase/server"
import { podeGerir } from "@/lib/autorizacao"

const mockCreateClient = vi.mocked(createClient)
const mockPodeGerir = vi.mocked(podeGerir)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const COMP = "22222222-2222-4222-8222-222222222222"
const SEASON = "33333333-3333-4333-8333-333333333333"
const LIGA_MAE = "44444444-4444-4444-8444-444444444444"

function fakeSupabase({
  user = { id: "u1" } as { id: string } | null,
  ligaDoTorneio = null as string | null,
  updateError = null as { message: string } | null,
  onUpdate,
}: {
  user?: { id: string } | null
  ligaDoTorneio?: string | null
  updateError?: { message: string } | null
  onUpdate?: (payload: Record<string, unknown>) => void
} = {}) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (fn: string) =>
      fn === "liga_do_torneio"
        ? { data: ligaDoTorneio, error: null }
        : { data: null, error: null },
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        onUpdate?.(payload)
        return { eq: async () => ({ error: updateError }) }
      },
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>
}

beforeEach(() => {
  mockCreateClient.mockReset()
  mockPodeGerir.mockReset()
})

describe("definirListadaTorneio", () => {
  it("dados inválidos → erro (sem tocar no banco)", async () => {
    const r = await definirListadaTorneio({ tournamentId: "nao-uuid", listada: true })
    expect(r).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("não autenticado → erro", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase({ user: null }))
    const r = await definirListadaTorneio({ tournamentId: TORNEIO, listada: true })
    expect(r.ok).toBe(false)
  })

  it("sem capacidade GERIR → rejeitado", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase())
    mockPodeGerir.mockResolvedValue(false)
    const r = await definirListadaTorneio({ tournamentId: TORNEIO, listada: true })
    expect(r).toEqual({
      ok: false,
      error: "Você não tem permissão para gerir este torneio.",
    })
  })

  it("torneio de DIVISÃO (liga_do_torneio não-nulo) → rejeitado", async () => {
    mockCreateClient.mockResolvedValue(
      fakeSupabase({ ligaDoTorneio: LIGA_MAE })
    )
    mockPodeGerir.mockResolvedValue(true)
    const r = await definirListadaTorneio({ tournamentId: TORNEIO, listada: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/liga-mãe/i)
  })

  it("gestor de torneio de topo → grava listada", async () => {
    const updates: Record<string, unknown>[] = []
    mockCreateClient.mockResolvedValue(
      fakeSupabase({ ligaDoTorneio: null, onUpdate: (p) => updates.push(p) })
    )
    mockPodeGerir.mockResolvedValue(true)
    const r = await definirListadaTorneio({ tournamentId: TORNEIO, listada: true })
    expect(r).toEqual({ ok: true })
    expect(updates).toEqual([{ listada: true }])
  })
})

describe("definirListadaLiga", () => {
  it("sem capacidade GERIR → rejeitado", async () => {
    mockCreateClient.mockResolvedValue(fakeSupabase())
    mockPodeGerir.mockResolvedValue(false)
    const r = await definirListadaLiga({
      competitionId: COMP,
      seasonId: SEASON,
      listada: true,
    })
    expect(r).toEqual({
      ok: false,
      error: "Você não tem permissão para gerir esta liga.",
    })
  })

  it("gestor da liga → grava listada", async () => {
    const updates: Record<string, unknown>[] = []
    mockCreateClient.mockResolvedValue(
      fakeSupabase({ onUpdate: (p) => updates.push(p) })
    )
    mockPodeGerir.mockResolvedValue(true)
    const r = await definirListadaLiga({
      competitionId: COMP,
      seasonId: SEASON,
      listada: false,
    })
    expect(r).toEqual({ ok: true })
    expect(updates).toEqual([{ listada: false }])
  })
})
