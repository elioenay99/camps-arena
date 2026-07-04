import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getPropostasPendentes } from "@/features/match/data/getPropostasPendentes"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

/** Cliente falso: from().select().eq().eq().order() → {data,error}. */
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
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getPropostasPendentes", () => {
  it("expõe o matchId (id da partida do embed) além dos placares e lados", async () => {
    const client = montarClient({
      data: [
        {
          id: "p1",
          placar_1: 3,
          placar_2: 1,
          match: {
            id: "m1",
            vaga_1: { rotulo: null, clube: { nome: "Grêmio" } },
            vaga_2: { rotulo: "Time B", clube: null },
          },
        },
      ],
    })

    const r = await getPropostasPendentes(
      client as unknown as ServerClient,
      TORNEIO
    )

    expect(r).toEqual([
      {
        id: "p1",
        matchId: "m1",
        placar_1: 3,
        placar_2: 1,
        lado1: "Grêmio",
        lado2: "Time B",
      },
    ])
    expect(client.from).toHaveBeenCalledWith("match_score_proposals")
    // Só pendentes, escopadas ao torneio via embed inner.
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "status", "pendente")
    expect(client.filtroSpy).toHaveBeenCalledWith(
      "eq",
      "match.tournament_id",
      TORNEIO
    )
  })

  it("traz o id da partida no embed inner do select", async () => {
    const client = montarClient({ data: [] })
    await getPropostasPendentes(client as unknown as ServerClient, TORNEIO)
    const select = client.selectSpy.mock.calls[0][0] as string
    expect(select).toContain("matches!match_score_proposals_match_id_fkey!inner")
    // O id da partida é selecionado dentro do embed (para o gate de edição direta).
    expect(select).toMatch(/!inner\s*\(\s*id/u)
  })

  it("retorna [] quando data é null ou há erro", async () => {
    expect(
      await getPropostasPendentes(
        montarClient({ data: null }) as unknown as ServerClient,
        TORNEIO
      )
    ).toEqual([])
    expect(
      await getPropostasPendentes(
        montarClient({ error: { message: "falha" } }) as unknown as ServerClient,
        TORNEIO
      )
    ).toEqual([])
  })
})
