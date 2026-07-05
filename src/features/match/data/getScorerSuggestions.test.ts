import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getScorerSuggestions } from "@/features/match/data/getScorerSuggestions"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

function mockClient(responses: Record<string, Resp>) {
  function builderFor(table: string) {
    const resp = responses[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or"]) {
      builder[m] = () => builder
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: resp.data ?? null, error: resp.error ?? null })
    return builder
  }
  return { from: (table: string) => builderFor(table) } as unknown as ServerClient
}

const CID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

beforeEach(() => vi.clearAllMocks())

describe("getScorerSuggestions", () => {
  it("devolve os nomes do competidor ordenados por prominência (gols desc)", async () => {
    const client = mockClient({
      tournament_slots: { data: [{ id: "slotA" }] },
      matches: { data: [{ id: "m1", vaga_1: "slotA", vaga_2: "slotX" }] },
      match_goals: {
        data: [
          { match_id: "m1", lado: 1, jogador: "Endrick", gols: 1 },
          { match_id: "m1", lado: 1, jogador: "Vini", gols: 3 },
          { match_id: "m1", lado: 2, jogador: "Rival", gols: 9 }, // adversário — não sugere
        ],
      },
    })

    expect(await getScorerSuggestions(client, { competitorId: CID })).toEqual([
      "Vini",
      "Endrick",
    ])
  })

  it("devolve [] quando o competidor nunca registrou gols", async () => {
    const client = mockClient({ tournament_slots: { data: [] } })
    expect(await getScorerSuggestions(client, { competitorId: CID })).toEqual([])
  })
})
