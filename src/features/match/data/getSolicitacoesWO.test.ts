import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getSolicitacoesWO } from "@/features/match/data/getSolicitacoesWO"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

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
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getSolicitacoesWO", () => {
  it("resolve clube solicitante e rodada dos embeds, filtrando por pendente + torneio", async () => {
    const client = montarClient({
      data: [
        {
          id: "r1",
          match_id: "m1",
          solicitante: { team: { nome: "Grêmio" } },
          match: { rodada: 2 },
        },
        // Embeds ausentes ganham fallback.
        { id: "r2", match_id: "m2", solicitante: null, match: null },
        // Com foto de evidência anexada → temFoto true.
        {
          id: "r3",
          match_id: "m3",
          solicitante: { rotulo: "Time C" },
          match: { rodada: 5 },
          foto_path: "uid/m3/abc.png",
        },
      ],
    })

    const r = await getSolicitacoesWO(TORNEIO)

    expect(r).toEqual([
      { id: "r1", matchId: "m1", clubeSolicitante: "Grêmio", rodada: 2, temFoto: false },
      { id: "r2", matchId: "m2", clubeSolicitante: "Competidor", rodada: null, temFoto: false },
      { id: "r3", matchId: "m3", clubeSolicitante: "Time C", rodada: 5, temFoto: true },
    ])
    expect(client.from).toHaveBeenCalledWith("match_wo_requests")
    // Só pendentes, escopadas ao torneio via embed inner.
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "status", "pendente")
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "match.tournament_id", TORNEIO)
    // Ordem de chegada (estável).
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", { ascending: true })
  })

  it("embed inner do match no select (filtro por torneio)", async () => {
    const client = montarClient({ data: [] })
    await getSolicitacoesWO(TORNEIO)
    const select = client.selectSpy.mock.calls[0][0] as string
    expect(select).toContain("matches!match_wo_requests_match_id_fkey!inner")
    expect(select).toContain("tournament_slots!match_wo_requests_solicitante_slot_fkey")
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    expect(await getSolicitacoesWO(TORNEIO)).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getSolicitacoesWO(TORNEIO)).rejects.toThrow(
      /Falha ao carregar as solicitações de W\.O\./
    )
  })
})
