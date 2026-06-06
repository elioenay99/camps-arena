import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getMeusTorneios } from "@/features/tournament/data/getMeusTorneios"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const USER_ID = "22222222-2222-4222-8222-222222222222"
const OUTRO = "33333333-3333-4333-8333-333333333333"

interface Cenario {
  organizo?: { data: unknown[] | null; error?: { message: string } | null }
  participo?: { data: unknown[] | null; error?: { message: string } | null }
}

/** Cliente falso com builders independentes por tabela. */
function montarClient(c: Cenario) {
  const filtroSpy = vi.fn()
  function builderPara(resultado: {
    data: unknown[] | null
    error?: { message: string } | null
  }) {
    const builder = {
      eq: vi.fn((col: string, val: unknown) => {
        filtroSpy("eq", col, val)
        return builder
      }),
      order: vi.fn(() =>
        Promise.resolve({ data: resultado.data, error: resultado.error ?? null })
      ),
    }
    return builder
  }
  const client = {
    from: vi.fn((tabela: string) => ({
      select: vi.fn(() =>
        builderPara(
          tabela === "tournaments"
            ? (c.organizo ?? { data: [] })
            : (c.participo ?? { data: [] })
        )
      ),
    })),
    filtroSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getMeusTorneios", () => {
  it("separa organizo/participo e NÃO duplica torneio próprio em participo", async () => {
    const client = montarClient({
      organizo: { data: [{ id: "t1", titulo: "Minha Copa", status: "ativo" }] },
      participo: {
        data: [
          // Próprio torneio (dono também é participante) — sai da lista.
          {
            tournament: {
              id: "t1",
              titulo: "Minha Copa",
              status: "ativo",
              created_by: USER_ID,
            },
          },
          // Torneio de terceiro onde participo — fica.
          {
            tournament: {
              id: "t2",
              titulo: "Copa do Bairro",
              status: "ativo",
              created_by: OUTRO,
            },
          },
          // Torneio sem dono (legado) onde participo — fica.
          {
            tournament: {
              id: "t3",
              titulo: "Torneio de Teste",
              status: "encerrado",
              created_by: null,
            },
          },
        ],
      },
    })

    const r = await getMeusTorneios(USER_ID)

    expect(r.organizo).toEqual([
      { id: "t1", titulo: "Minha Copa", status: "ativo" },
    ])
    expect(r.participo).toEqual([
      { id: "t2", titulo: "Copa do Bairro", status: "ativo" },
      { id: "t3", titulo: "Torneio de Teste", status: "encerrado" },
    ])
    expect(client.from).toHaveBeenCalledWith("tournaments")
    expect(client.from).toHaveBeenCalledWith("participants")
    // Filtros explícitos por usuário nas duas pontas.
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "created_by", USER_ID)
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "user_id", USER_ID)
  })

  it("listas vazias quando data é null", async () => {
    montarClient({ organizo: { data: null }, participo: { data: null } })
    expect(await getMeusTorneios(USER_ID)).toEqual({ organizo: [], participo: [] })
  })

  it("erro em qualquer query lança erro amigável", async () => {
    montarClient({ organizo: { data: null, error: { message: "down" } } })
    await expect(getMeusTorneios(USER_ID)).rejects.toThrow(
      /Falha ao carregar seus torneios/
    )

    montarClient({ participo: { data: null, error: { message: "down" } } })
    await expect(getMeusTorneios(USER_ID)).rejects.toThrow(
      /Falha ao carregar suas participações/
    )
  })
})
