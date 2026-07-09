import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { revalidatePath } from "next/cache"

import { registrarAutoresLado } from "@/actions/matchGoals"
import { createClient } from "@/lib/supabase/server"

const mockRevalidate = vi.mocked(revalidatePath)
const mockCreateClient = vi.mocked(createClient)

const MID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"

interface Cenario {
  user?: { id: string } | null
  rpcData?: number | null
  rpcError?: { message: string } | null
}

function montarClient(c: Cenario) {
  const rpcSpy = vi.fn(async () => ({
    data: c.rpcData ?? null,
    error: c.rpcError ?? null,
  }))
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: c.user ?? null }, error: null }),
    },
    rpc: rpcSpy,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: { tournament_id: "t1" }, error: null }),
        })),
      })),
    })),
    rpcSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("registrarAutoresLado", () => {
  it("passa modo='append' e o payload (só o delta) à RPC", async () => {
    const c = montarClient({ user: { id: USER_ID }, rpcData: 3 })
    const r = await registrarAutoresLado({
      matchId: MID,
      lado: 1,
      autores: [{ jogador: "João", gols: 1, contra: false }],
      modo: "append",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.total).toBe(3)
    expect(c.rpcSpy).toHaveBeenCalledWith("registrar_autores_lado", {
      p_match_id: MID,
      p_lado: 1,
      p_autores: [{ jogador: "João", gols: 1, contra: false }],
      p_modo: "append",
    })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
  })

  it("passa modo='replace' com a lista completa", async () => {
    const c = montarClient({ user: { id: USER_ID }, rpcData: 2 })
    await registrarAutoresLado({
      matchId: MID,
      lado: 2,
      autores: [
        { jogador: "Vini", gols: 1, contra: false },
        { gols: 1, contra: true },
      ],
      modo: "replace",
    })
    expect(c.rpcSpy).toHaveBeenCalledWith(
      "registrar_autores_lado",
      expect.objectContaining({ p_lado: 2, p_modo: "replace" })
    )
  })

  it("propaga o erro de teto do lado (TETO_LADO) com mensagem amigável", async () => {
    montarClient({ user: { id: USER_ID }, rpcError: { message: "TETO_LADO" } })
    const r = await registrarAutoresLado({
      matchId: MID,
      lado: 1,
      autores: [{ jogador: "X", gols: 9, contra: false }],
      modo: "append",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/mais gols que o placar/i)
  })

  it("mapeia NAO_AUTORIZADO", async () => {
    montarClient({ user: { id: USER_ID }, rpcError: { message: "NAO_AUTORIZADO" } })
    const r = await registrarAutoresLado({
      matchId: MID,
      lado: 1,
      autores: [{ jogador: "X", gols: 1, contra: false }],
      modo: "replace",
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não pode editar/i)
  })

  it("rejeita payload inválido (modo desconhecido) sem chamar a RPC", async () => {
    const c = montarClient({ user: { id: USER_ID } })
    const r = await registrarAutoresLado({
      matchId: MID,
      lado: 1,
      autores: [{ jogador: "X", gols: 1, contra: false }],
      // @ts-expect-error modo inválido de propósito
      modo: "sobrescrever",
    })
    expect(r.ok).toBe(false)
    expect(c.rpcSpy).not.toHaveBeenCalled()
  })

  it("exige autenticação", async () => {
    const c = montarClient({ user: null })
    const r = await registrarAutoresLado({
      matchId: MID,
      lado: 1,
      autores: [{ jogador: "X", gols: 1, contra: false }],
      modo: "append",
    })
    expect(r.ok).toBe(false)
    expect(c.rpcSpy).not.toHaveBeenCalled()
  })
})
