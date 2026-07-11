import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { expulsarTecnicoWo, perdoarWoTecnico } from "@/actions/wo"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = "22222222-2222-4222-8222-222222222222"
const TECNICO = "33333333-3333-4333-8333-333333333333"
const SLOT = "44444444-4444-4444-8444-444444444444"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** `pode_gerir_torneio` devolve isto. */
  gerir?: boolean
  /** Retorno da RPC disciplinar (perdoar/expulsar). */
  rpcData?: number | null
  rpcError?: boolean
}

function montarClient(cfg: Cenario) {
  const rpcSpy = vi.fn(async (fn: string) => {
    if (fn === "pode_gerir_torneio") {
      return { data: cfg.gerir ?? false, error: null }
    }
    // perdoar_wo_tecnico / expulsar_tecnico_wo
    return {
      data: cfg.rpcData ?? 0,
      error: cfg.rpcError ? { message: "rpc" } : null,
    }
  })

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: cfg.authError ? null : cfg.user ?? { id: "u1" } },
        error: cfg.authError ? { message: "auth" } : null,
      })),
    },
    rpc: rpcSpy,
  }
  return { client, rpcSpy }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("perdoarWoTecnico", () => {
  it("rejeita ids inválidos sem tocar o supabase", async () => {
    const { client, rpcSpy } = montarClient({})
    mockCreateClient.mockResolvedValue(client as never)
    const r = await perdoarWoTecnico("nao-uuid", TECNICO)
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("exige autenticação", async () => {
    const { client } = montarClient({ authError: true })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await perdoarWoTecnico(TORNEIO, TECNICO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autenticado/i)
  })

  it("barra quem não gere o torneio", async () => {
    const { client, rpcSpy } = montarClient({ gerir: false })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await perdoarWoTecnico(TORNEIO, TECNICO)
    expect(r.ok).toBe(false)
    // chamou o gate, mas nunca a RPC de perdão
    expect(rpcSpy).toHaveBeenCalledWith("pode_gerir_torneio", { p_tid: TORNEIO })
    expect(rpcSpy).not.toHaveBeenCalledWith(
      "perdoar_wo_tecnico",
      expect.anything()
    )
  })

  it("gestor perdoa e retorna o número de perdões novos", async () => {
    const { client, rpcSpy } = montarClient({ gerir: true, rpcData: 3 })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await perdoarWoTecnico(TORNEIO, TECNICO)
    expect(r).toEqual({ ok: true, perdoados: 3 })
    expect(rpcSpy).toHaveBeenCalledWith("perdoar_wo_tecnico", {
      p_tournament_id: TORNEIO,
      p_user_id: TECNICO,
    })
  })

  it("propaga erro da RPC como falha amigável", async () => {
    const { client } = montarClient({ gerir: true, rpcError: true })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await perdoarWoTecnico(TORNEIO, TECNICO)
    expect(r.ok).toBe(false)
  })
})

describe("expulsarTecnicoWo", () => {
  it("rejeita ids inválidos", async () => {
    const { client, rpcSpy } = montarClient({})
    mockCreateClient.mockResolvedValue(client as never)
    const r = await expulsarTecnicoWo(TORNEIO, "nao-uuid")
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("barra quem não gere o torneio", async () => {
    const { client, rpcSpy } = montarClient({ gerir: false })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await expulsarTecnicoWo(TORNEIO, SLOT)
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalledWith(
      "expulsar_tecnico_wo",
      expect.anything()
    )
  })

  it("gestor expulsa (1 linha) → expulsou true", async () => {
    const { client, rpcSpy } = montarClient({ gerir: true, rpcData: 1 })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await expulsarTecnicoWo(TORNEIO, SLOT)
    expect(r).toEqual({ ok: true, expulsou: true })
    expect(rpcSpy).toHaveBeenCalledWith("expulsar_tecnico_wo", {
      p_tournament_id: TORNEIO,
      p_slot_id: SLOT,
    })
  })

  it("vaga já vazia (0 linhas) → expulsou false", async () => {
    const { client } = montarClient({ gerir: true, rpcData: 0 })
    mockCreateClient.mockResolvedValue(client as never)
    const r = await expulsarTecnicoWo(TORNEIO, SLOT)
    expect(r).toEqual({ ok: true, expulsou: false })
  })
})
