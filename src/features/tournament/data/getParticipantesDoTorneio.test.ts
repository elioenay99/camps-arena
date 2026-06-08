import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getParticipantesDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

/** Cliente falso: from().select().eq().order() → {data,error}. */
function montarClient(c: Cenario) {
  const selectSpy = vi.fn()
  const filtroSpy = vi.fn()
  const orderSpy = vi.fn()
  const builder = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroSpy("eq", col, val)
      return builder
    }),
    order: vi.fn((col: string, opts: unknown) => {
      orderSpy(col, opts)
      return Promise.resolve({ data: c.data ?? null, error: c.error ?? null })
    }),
  }
  const client = {
    from: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        selectSpy(cols)
        return builder
      }),
    })),
    selectSpy,
    filtroSpy,
    orderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getParticipantesDoTorneio", () => {
  it("resolve id/nome a partir do embed, filtrando pelo torneio", async () => {
    const client = montarClient({
      data: [
        { user_id: "u1", usuario: { id: "u1", nome: "Ana", avatar: "a1.png" } },
        { user_id: "u2", usuario: { id: "u2", nome: null, avatar: null } },
        { user_id: "u3", usuario: null },
      ],
    })

    const r = await getParticipantesDoTorneio(TORNEIO)

    expect(r).toEqual([
      { id: "u1", nome: "Ana", avatar: "a1.png" },
      { id: "u2", nome: null, avatar: null },
      { id: "u3", nome: null, avatar: null },
    ])
    expect(client.from).toHaveBeenCalledWith("participants")
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
    // Ordem de ENTRADA (estável) — não reordena quando alguém renomeia o perfil.
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", { ascending: true })
  })

  it("seleciona só id/nome no embed — sem celular (PII)", async () => {
    const client = montarClient({ data: [] })
    await getParticipantesDoTorneio(TORNEIO)
    const select = client.selectSpy.mock.calls[0][0] as string
    expect(select).toContain("users!participants_user_id_fkey")
    expect(select).not.toContain("celular")
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    expect(await getParticipantesDoTorneio(TORNEIO)).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getParticipantesDoTorneio(TORNEIO)).rejects.toThrow(
      /Falha ao carregar participantes/
    )
  })
})
