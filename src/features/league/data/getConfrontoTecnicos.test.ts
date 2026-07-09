import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getConfrontoTecnicos } from "@/features/league/data/getConfrontoTecnicos"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface TenureRow {
  slot_id: string
  rodada_inicio: number | null
  rodada_fim: number | null
}
interface MatchRow {
  id: string
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  status: string
  rodada: number | null
  created_at: string
  wo: boolean
  wo_vencedor: string | null
  wo_duplo: boolean
}

/**
 * Mock: `coach_tenures` diferenciado pelo valor de `.eq("user_id", <id>)` (A vs B);
 * `matches` resolve direto (o fetcher filtra por janela em memória).
 */
function mockClient(opts: {
  tenuresPorUser: Record<string, TenureRow[]>
  matches: MatchRow[]
}) {
  function builderFor(table: string) {
    const log: unknown[][] = []
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or"]) {
      builder[m] = (...args: unknown[]) => {
        log.push([m, ...args])
        return builder
      }
    }
    builder.then = (resolve: (v: unknown) => unknown) => {
      if (table === "coach_tenures") {
        const eq = log.find((a) => a[0] === "eq" && a[1] === "user_id")
        const uid = eq?.[2] as string | undefined
        return resolve({ data: (uid && opts.tenuresPorUser[uid]) || [], error: null })
      }
      if (table === "matches") return resolve({ data: opts.matches, error: null })
      return resolve({ data: [], error: null })
    }
    return builder
  }
  return { from: builderFor } as unknown as ServerClient
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

function match(over: Partial<MatchRow> & { id: string }): MatchRow {
  return {
    vaga_1: null,
    vaga_2: null,
    placar_1: 0,
    placar_2: 0,
    status: "encerrada",
    rodada: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    wo: false,
    wo_vencedor: null,
    wo_duplo: false,
    ...over,
  }
}

describe("getConfrontoTecnicos", () => {
  it("auto-confronto (A == B) → vazio", async () => {
    const client = mockClient({ tenuresPorUser: {}, matches: [] })
    const r = await getConfrontoTecnicos(client, { userAId: A, userBId: A })
    expect(r.jogos).toEqual([])
  })

  it("conta só jogos nas DUAS janelas; adversário terceiro não entra", async () => {
    const client = mockClient({
      tenuresPorUser: {
        [A]: [{ slot_id: "sa", rodada_inicio: null, rodada_fim: null }],
        [B]: [{ slot_id: "sb", rodada_inicio: null, rodada_fim: null }],
      },
      matches: [
        match({ id: "m1", vaga_1: "sa", vaga_2: "sb", placar_1: 3, placar_2: 0, rodada: 1 }),
        match({ id: "m2", vaga_1: "sa", vaga_2: "sc", placar_1: 9, placar_2: 0, rodada: 2 }),
      ],
    })
    const r = await getConfrontoTecnicos(client, { userAId: A, userBId: B })
    expect(r.jogos.map((j) => j.matchId)).toEqual(["m1"])
    expect(r.aVitorias).toBe(1)
    expect(r.aGolsPro).toBe(3)
    expect(r.aGolsContra).toBe(0)
  })

  it("jogo fora da janela de B não conta", async () => {
    const client = mockClient({
      tenuresPorUser: {
        [A]: [{ slot_id: "sa", rodada_inicio: null, rodada_fim: null }],
        [B]: [{ slot_id: "sb", rodada_inicio: 5, rodada_fim: null }], // só a partir da rodada 5
      },
      matches: [
        match({ id: "m1", vaga_1: "sa", vaga_2: "sb", placar_1: 1, placar_2: 0, rodada: 2 }),
        match({ id: "m2", vaga_1: "sa", vaga_2: "sb", placar_1: 2, placar_2: 1, rodada: 5 }),
      ],
    })
    const r = await getConfrontoTecnicos(client, { userAId: A, userBId: B })
    expect(r.jogos.map((j) => j.matchId)).toEqual(["m2"])
    expect(r.aVitorias).toBe(1)
  })

  it("W.O. simples é respeitado (vitória de A, sem gols)", async () => {
    const client = mockClient({
      tenuresPorUser: {
        [A]: [{ slot_id: "sa", rodada_inicio: null, rodada_fim: null }],
        [B]: [{ slot_id: "sb", rodada_inicio: null, rodada_fim: null }],
      },
      matches: [
        match({
          id: "m1",
          vaga_1: "sa",
          vaga_2: "sb",
          placar_1: 0,
          placar_2: 0,
          rodada: 1,
          wo: true,
          wo_vencedor: "sa",
        }),
      ],
    })
    const r = await getConfrontoTecnicos(client, { userAId: A, userBId: B })
    expect(r.aVitorias).toBe(1)
    expect(r.jogos[0]).toMatchObject({ wo: true, resultadoA: "V" })
    expect(r.aGolsPro).toBe(0)
  })

  it("degrada para vazio quando B não tem tenures", async () => {
    const client = mockClient({
      tenuresPorUser: { [A]: [{ slot_id: "sa", rodada_inicio: null, rodada_fim: null }] },
      matches: [],
    })
    const r = await getConfrontoTecnicos(client, { userAId: A, userBId: B })
    expect(r.jogos).toEqual([])
  })
})
