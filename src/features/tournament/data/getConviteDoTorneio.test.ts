import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getConviteDoTorneio } from "@/features/tournament/data/getConviteDoTorneio"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  data?: { code: string } | null
  error?: { message: string } | null
}

function montarClient(c: Cenario) {
  const filtroSpy = vi.fn()
  const builder = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroSpy("eq", col, val)
      return builder
    }),
    maybeSingle: vi.fn(async () => ({
      data: c.data ?? null,
      error: c.error ?? null,
    })),
  }
  const client = {
    from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    filtroSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getConviteDoTorneio", () => {
  it("devolve o código quando a RLS retorna a linha (dono)", async () => {
    const client = montarClient({ data: { code: "abc123def456ghj7" } })
    expect(await getConviteDoTorneio(TORNEIO)).toBe("abc123def456ghj7")
    expect(client.from).toHaveBeenCalledWith("tournament_invites")
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
  })

  it("devolve null sem linha (não-dono pela RLS, ou torneio sem convite)", async () => {
    montarClient({ data: null })
    expect(await getConviteDoTorneio(TORNEIO)).toBeNull()
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "down" } })
    await expect(getConviteDoTorneio(TORNEIO)).rejects.toThrow(
      /Falha ao carregar o convite/
    )
  })
})
