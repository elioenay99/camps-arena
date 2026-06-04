import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getParticipantesDisponiveis } from "@/features/match/data/getParticipantesDisponiveis"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

function montarClient(c: Cenario) {
  const selectSpy = vi.fn()
  const orderSpy = vi.fn()
  const client = {
    from: vi.fn(() => ({
      select: vi.fn((cols: unknown) => {
        selectSpy(cols)
        return {
          order: vi.fn((col: string, opts: unknown) => {
            orderSpy(col, opts)
            return Promise.resolve({ data: c.data ?? null, error: c.error ?? null })
          }),
        }
      }),
    })),
    selectSpy,
    orderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getParticipantesDisponiveis", () => {
  it("lê users com SÓ id e nome (sem celular — PII desnecessária aqui)", async () => {
    const linhas = [{ id: "u1", nome: "Ana" }]
    const client = montarClient({ data: linhas })

    const r = await getParticipantesDisponiveis()

    expect(r).toEqual(linhas)
    expect(client.from).toHaveBeenCalledWith("users")
    const colunas = String(client.selectSpy.mock.calls[0][0])
    expect(colunas).toBe("id, nome")
    expect(colunas).not.toContain("celular")
    // Ordem alfabética por nome (D6 do design).
    expect(client.orderSpy).toHaveBeenCalledWith("nome", { ascending: true })
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    expect(await getParticipantesDisponiveis()).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getParticipantesDisponiveis()).rejects.toThrow(
      /Falha ao carregar participantes/
    )
  })
})
