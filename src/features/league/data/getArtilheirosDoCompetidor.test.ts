import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  agregarPorNome,
  getArtilheirosDoCompetidor,
} from "@/features/league/data/getArtilheirosDoCompetidor"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

/**
 * Client falso: cada `from(table)` devolve um builder thenable cujos métodos
 * (select/eq/in/or) encadeiam e o await resolve a resposta daquela tabela.
 */
function mockClient(responses: Record<string, Resp>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  function builderFor(table: string) {
    const resp = responses[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or"]) {
      builder[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: resp.data ?? null, error: resp.error ?? null })
    return builder
  }
  return {
    client: { from: (table: string) => builderFor(table) } as unknown as ServerClient,
    calls,
  }
}

const CID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

beforeEach(() => vi.clearAllMocks())

describe("agregarPorNome", () => {
  it("soma por nome normalizado (case-insensitive), grafia estável", () => {
    expect(
      agregarPorNome([
        { jogador: "Endrick", gols: 2 },
        { jogador: "endrick", gols: 1 },
        { jogador: "Vini", gols: 5 },
      ])
    ).toEqual([
      { jogador: "Vini", gols: 5 },
      // Grafia exibida = menor por localeCompare (determinística, independe da
      // ordem do DB): "endrick" < "Endrick".
      { jogador: "endrick", gols: 3 },
    ])
  })

  it("ignora nome vazio após trim", () => {
    expect(agregarPorNome([{ jogador: "   ", gols: 3 }])).toEqual([])
  })
})

describe("getArtilheirosDoCompetidor", () => {
  it("soma os gols do LADO do competidor através das temporadas, ignorando o adversário", async () => {
    const { client } = mockClient({
      tournament_slots: { data: [{ id: "slotA" }, { id: "slotA2" }] },
      matches: {
        data: [
          { id: "m1", vaga_1: "slotA", vaga_2: "slotX" }, // competidor no lado 1
          { id: "m2", vaga_1: "slotY", vaga_2: "slotA2" }, // competidor no lado 2
        ],
      },
      match_goals: {
        data: [
          { match_id: "m1", lado: 1, jogador: "Endrick", gols: 2 },
          { match_id: "m1", lado: 2, jogador: "Rival", gols: 5 }, // adversário — ignora
          { match_id: "m2", lado: 2, jogador: "Endrick", gols: 1 },
          { match_id: "m2", lado: 2, jogador: "Vini", gols: 2 },
          { match_id: "m2", lado: 1, jogador: "Outro", gols: 3 }, // adversário — ignora
        ],
      },
    })

    const r = await getArtilheirosDoCompetidor(client, { competitorId: CID })
    expect(r).toEqual([
      { jogador: "Endrick", gols: 3 },
      { jogador: "Vini", gols: 2 },
    ])
  })

  it("retorna [] quando o competidor não tem vagas", async () => {
    const { client } = mockClient({ tournament_slots: { data: [] } })
    expect(await getArtilheirosDoCompetidor(client, { competitorId: CID })).toEqual([])
  })

  it("retorna [] em erro de IO nas vagas", async () => {
    const { client } = mockClient({
      tournament_slots: { error: { message: "falha" } },
    })
    expect(await getArtilheirosDoCompetidor(client, { competitorId: CID })).toEqual([])
  })
})
