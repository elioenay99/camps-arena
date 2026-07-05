import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getCompetidorInsights } from "@/features/league/data/getCompetidorInsights"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

/** Mock por tabela; a resposta pode ser função dos args de `.eq/.or`. */
function mockClient(
  responses: Record<string, Resp | ((args: unknown[][]) => Resp)>
) {
  function builderFor(table: string) {
    const argsLog: unknown[][] = []
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or", "neq"]) {
      builder[m] = (...args: unknown[]) => {
        argsLog.push(args)
        return builder
      }
    }
    const resolveResp = (): Resp => {
      const r = responses[table] ?? { data: [], error: null }
      return typeof r === "function" ? r(argsLog) : r
    }
    builder.maybeSingle = () => {
      const resp = resolveResp()
      return Promise.resolve({ data: resp.data ?? null, error: resp.error ?? null })
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      const resp = resolveResp()
      return resolve({ data: resp.data ?? null, error: resp.error ?? null })
    }
    return builder
  }
  return { client: { from: builderFor } as unknown as ServerClient }
}

const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

describe("getCompetidorInsights", () => {
  it("degrada para vazio sem slots", async () => {
    const { client } = mockClient({ tournament_slots: { data: [] } })
    const r = await getCompetidorInsights(client, { competitorId: C })
    expect(r.forma).toEqual([])
    expect(r.destaques.jogos).toBe(0)
  })

  it("unifica slots de temporadas distintas (A2) e ordena por data (A4)", async () => {
    const { client } = mockClient({
      tournament_slots: { data: [{ id: "s1" }, { id: "s2" }] },
      matches: {
        data: [
          // temporada 1 (s1), rodada alta, data ANTERIOR: vitória 3x0
          {
            id: "m1",
            vaga_1: "s1",
            vaga_2: "oppX",
            placar_1: 3,
            placar_2: 0,
            status: "encerrada",
            rodada: 30,
            created_at: "2026-01-01T00:00:00.000Z",
            wo: false,
            wo_vencedor: null,
            wo_duplo: false,
          },
          // temporada 2 (s2), rodada baixa, data POSTERIOR: vitória 2x1 (lado 2)
          {
            id: "m2",
            vaga_1: "oppY",
            vaga_2: "s2",
            placar_1: 1,
            placar_2: 2,
            status: "encerrada",
            rodada: 1,
            created_at: "2026-06-01T00:00:00.000Z",
            wo: false,
            wo_vencedor: null,
            wo_duplo: false,
          },
        ],
      },
    })
    const r = await getCompetidorInsights(client, { competitorId: C })
    // Ordena por DATA (jan antes de jun), apesar da rodada 30 > 1.
    expect(r.forma.map((i) => i.resultado)).toEqual(["V", "V"])
    expect(r.destaques.jogos).toBe(2)
    expect(r.destaques.vitorias).toBe(2)
    expect(r.destaques.golsPro).toBe(5) // 3 + 2
    expect(r.destaques.golsContra).toBe(1) // 0 + 1
    expect(r.destaques.maiorSequenciaVitorias).toBe(2)
  })

  it("W.O. a favor entra na forma sem creditar gol", async () => {
    const { client } = mockClient({
      tournament_slots: { data: [{ id: "s1" }] },
      matches: {
        data: [
          {
            id: "m1",
            vaga_1: "s1",
            vaga_2: "oppX",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            rodada: 1,
            created_at: "2026-01-01T00:00:00.000Z",
            wo: true,
            wo_vencedor: "s1",
            wo_duplo: false,
          },
        ],
      },
    })
    const r = await getCompetidorInsights(client, { competitorId: C })
    expect(r.forma).toEqual([{ resultado: "V", wo: true, rodada: 1 }])
    expect(r.destaques.golsPro).toBe(0)
    expect(r.destaques.vitorias).toBe(1)
  })
})
