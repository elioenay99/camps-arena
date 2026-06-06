import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getOwnTournaments } from "@/features/tournament/data/getOwnTournaments"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const USER_ID = "22222222-2222-4222-8222-222222222222"

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

/** Cliente falso: from().select().eq().neq().order() → {data,error}. */
function montarClient(c: Cenario) {
  const filtroSpy = vi.fn()
  const orderSpy = vi.fn()
  const builder = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroSpy("eq", col, val)
      return builder
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filtroSpy("neq", col, val)
      return builder
    }),
    order: vi.fn((col: string, opts: unknown) => {
      orderSpy(col, opts)
      return Promise.resolve({ data: c.data ?? null, error: c.error ?? null })
    }),
  }
  const client = {
    from: vi.fn(() => ({ select: vi.fn(() => builder) })),
    filtroSpy,
    orderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getOwnTournaments", () => {
  it("filtra por created_by do usuário, formato avulso e exclui encerrados", async () => {
    const linhas = [{ id: "t1", titulo: "Copa" }]
    const client = montarClient({ data: linhas })

    const r = await getOwnTournaments(USER_ID)

    expect(r).toEqual(linhas)
    expect(client.from).toHaveBeenCalledWith("tournaments")
    // Filtro EXPLÍCITO no servidor — a RLS sozinha deixaria passar públicos
    // de terceiros, onde o usuário NÃO pode criar partida.
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "created_by", USER_ID)
    // Liga não aceita partida manual — o seletor não a lista.
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "formato", "avulso")
    // Falha-segura: só 'encerrado' sai (rascunho recebe partidas).
    expect(client.filtroSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
    // Mais recentes primeiro (D6 do design).
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", { ascending: false })
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    expect(await getOwnTournaments(USER_ID)).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getOwnTournaments(USER_ID)).rejects.toThrow(
      /Falha ao carregar seus torneios/
    )
  })
})
