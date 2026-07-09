import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getArtilharia } from "@/features/league/data/getArtilharia"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

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

const T = "tttttttt-tttt-4ttt-8ttt-tttttttttttt"

beforeEach(() => vi.clearAllMocks())

describe("getArtilharia", () => {
  it("retorna [] sem torneios", async () => {
    const { client, calls } = mockClient({})
    expect(await getArtilharia(client, { tournamentIds: [] })).toEqual([])
    expect(calls).toHaveLength(0) // nem consulta
  })

  it("agrega por (competidor, nome), separa homônimos e ignora avulso/adversário sem competidor", async () => {
    const { client } = mockClient({
      matches: {
        data: [
          { id: "m1", vaga_1: "slotA", vaga_2: "slotB" },
          { id: "m2", vaga_1: "slotC", vaga_2: "slotA" },
        ],
      },
      tournament_slots: {
        data: [
          // Ataias por-nome (rótulo, team null) → escudoUrl null → monograma
          { id: "slotA", competitor_id: "cAtaias", rotulo: "Ataias", team: null },
          // slotB sem competidor (avulso/legado) — gols desse lado ficam de fora
          {
            id: "slotB",
            competitor_id: null,
            rotulo: null,
            team: { nome: "Zé FC", escudo_url: "https://x/ze.png" },
          },
          // João FC com escudo real → escudoUrl propagado até a linha
          {
            id: "slotC",
            competitor_id: "cJoao",
            rotulo: null,
            team: { nome: "João FC", escudo_url: "https://x/joao.png" },
          },
        ],
      },
      match_goals: {
        data: [
          { match_id: "m1", lado: 1, jogador: "Endrick", gols: 2 }, // Ataias
          { match_id: "m1", lado: 1, jogador: "Vini", gols: 3 }, // Ataias
          { match_id: "m1", lado: 2, jogador: "Zé", gols: 1 }, // slotB sem competidor → ignora
          { match_id: "m2", lado: 2, jogador: "endrick", gols: 2 }, // Ataias (case-insensitive)
          { match_id: "m2", lado: 1, jogador: "Endrick", gols: 1 }, // João — separado
        ],
      },
    })

    const r = await getArtilharia(client, { tournamentIds: [T] })
    expect(r).toEqual([
      // "Endrick"(2)+"endrick"(2): grafia exibida = menor por localeCompare.
      // Ataias é por-nome (team null) → escudoUrl null (cai no monograma).
      {
        competitorId: "cAtaias",
        competitorNome: "Ataias",
        jogador: "endrick",
        gols: 4,
        escudoUrl: null,
      },
      {
        competitorId: "cAtaias",
        competitorNome: "Ataias",
        jogador: "Vini",
        gols: 3,
        escudoUrl: null,
      },
      // João FC tem clube com escudo → escudoUrl propagado do slot.
      {
        competitorId: "cJoao",
        competitorNome: "João FC",
        jogador: "Endrick",
        gols: 1,
        escudoUrl: "https://x/joao.png",
      },
    ])
  })

  it("gol contra (contra=true) NÃO entra no ranking; o normal segue contando", async () => {
    const { client } = mockClient({
      matches: { data: [{ id: "m1", vaga_1: "slotA", vaga_2: "slotB" }] },
      tournament_slots: {
        data: [
          { id: "slotA", competitor_id: "cAtaias", rotulo: "Ataias", team: null },
          { id: "slotB", competitor_id: "cJoao", rotulo: "João", team: null },
        ],
      },
      match_goals: {
        data: [
          { match_id: "m1", lado: 1, jogador: "Vini", gols: 2, contra: false },
          // Gol contra NOMEADO do lado 1: fica FORA do ranking.
          { match_id: "m1", lado: 1, jogador: "Zagueiro X", gols: 1, contra: true },
          // Gol contra ANÔNIMO (jogador null) do lado 2: também fora, sem crash.
          { match_id: "m1", lado: 2, jogador: null, gols: 1, contra: true },
        ],
      },
    })
    const r = await getArtilharia(client, { tournamentIds: [T] })
    expect(r).toEqual([
      {
        competitorId: "cAtaias",
        competitorNome: "Ataias",
        jogador: "Vini",
        gols: 2,
        escudoUrl: null,
      },
    ])
  })

  it("retorna [] quando não há partidas visíveis", async () => {
    const { client } = mockClient({ matches: { data: [] } })
    expect(await getArtilharia(client, { tournamentIds: [T] })).toEqual([])
  })

  it("retorna [] quando nenhuma partida tem vaga (só avulso)", async () => {
    const { client } = mockClient({
      matches: { data: [{ id: "m1", vaga_1: null, vaga_2: null }] },
    })
    expect(await getArtilharia(client, { tournamentIds: [T] })).toEqual([])
  })
})
