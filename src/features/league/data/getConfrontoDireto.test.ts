import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getConfrontoDireto } from "@/features/league/data/getConfrontoDireto"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

/**
 * Mock que diferencia `tournament_slots` pelo arg de `.eq("competitor_id", X)` —
 * `getConfrontoDireto` consulta a MESMA tabela duas vezes (slots de A e de B).
 */
function mockClient(opts: {
  slotsPorCompetidor: Record<string, string[]>
  matches: Resp
}) {
  function builderFor(table: string) {
    const argsLog: unknown[][] = []
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or", "neq"]) {
      builder[m] = (...args: unknown[]) => {
        argsLog.push(args)
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (table === "tournament_slots") {
        const eq = argsLog.find((a) => a[0] === "competitor_id")
        const compId = eq?.[1] as string | undefined
        const ids = (compId && opts.slotsPorCompetidor[compId]) || []
        return resolve({ data: ids.map((id) => ({ id })), error: null })
      }
      return resolve({ data: opts.matches.data ?? null, error: opts.matches.error ?? null })
    }
    return builder
  }
  return { client: { from: builderFor } as unknown as ServerClient }
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

describe("getConfrontoDireto", () => {
  it("vazio quando A === B", async () => {
    const { client } = mockClient({ slotsPorCompetidor: {}, matches: { data: [] } })
    const r = await getConfrontoDireto(client, { competitorAId: A, competitorBId: A })
    expect(r.jogos).toEqual([])
  })

  it("A2: casa jogos entre slots de temporadas diferentes e remapeia lados", async () => {
    const { client } = mockClient({
      slotsPorCompetidor: { [A]: ["aS1", "aS2"], [B]: ["bS1", "bS2"] },
      matches: {
        data: [
          // temporada 1: A(aS1) 2 x 1 B(bS1)
          {
            id: "m1",
            vaga_1: "aS1",
            vaga_2: "bS1",
            placar_1: 2,
            placar_2: 1,
            status: "encerrada",
            rodada: 5,
            created_at: "2026-01-01T00:00:00.000Z",
            wo: false,
            wo_vencedor: null,
            wo_duplo: false,
          },
          // temporada 2: B(bS2) 0 x 0 A(aS2) — A é o lado 2
          {
            id: "m2",
            vaga_1: "bS2",
            vaga_2: "aS2",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            rodada: 3,
            created_at: "2026-06-01T00:00:00.000Z",
            wo: false,
            wo_vencedor: null,
            wo_duplo: false,
          },
          // ruído: A contra terceiro — NÃO deve casar
          {
            id: "m3",
            vaga_1: "aS1",
            vaga_2: "cccS",
            placar_1: 9,
            placar_2: 0,
            status: "encerrada",
            rodada: 6,
            created_at: "2026-02-01T00:00:00.000Z",
            wo: false,
            wo_vencedor: null,
            wo_duplo: false,
          },
        ],
      },
    })
    const r = await getConfrontoDireto(client, { competitorAId: A, competitorBId: B })
    expect(r.jogos.map((j) => j.matchId)).toEqual(["m1", "m2"]) // por data; m3 excluído
    expect(r.aVitorias).toBe(1)
    expect(r.empates).toBe(1)
    expect(r.bVitorias).toBe(0)
    // perspectiva de A no m2 (A era lado 2): 0 x 0
    expect(r.jogos[1]).toMatchObject({ placarA: 0, placarB: 0, resultadoA: "E" })
    expect(r.aGolsPro).toBe(2)
    expect(r.aGolsContra).toBe(1)
  })

  it("degrada para vazio quando um dos lados não tem slots", async () => {
    const { client } = mockClient({
      slotsPorCompetidor: { [A]: ["aS1"] }, // B sem slots
      matches: { data: [] },
    })
    const r = await getConfrontoDireto(client, { competitorAId: A, competitorBId: B })
    expect(r.jogos).toEqual([])
  })
})
