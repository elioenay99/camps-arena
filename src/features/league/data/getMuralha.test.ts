import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getMuralha } from "@/features/league/data/getMuralha"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface Resp {
  data?: unknown
  error?: unknown
}

/** Mock por tabela (mesmo molde de getCompetidorInsights.test.ts). */
function mockClient(responses: Record<string, Resp>) {
  function builderFor(table: string) {
    const builder: Record<string, unknown> = {}
    for (const m of ["select", "eq", "in", "or", "neq"]) {
      builder[m] = () => builder
    }
    const resp = (): Resp => responses[table] ?? { data: [], error: null }
    builder.then = (resolve: (v: unknown) => unknown) => {
      const r = resp()
      return resolve({ data: r.data ?? null, error: r.error ?? null })
    }
    return builder
  }
  return { client: { from: builderFor } as unknown as ServerClient }
}

const SLOTS = [
  { id: "s1", competitor_id: "c1", rotulo: null, team: { nome: "Alfa", escudo_url: null } },
  { id: "s2", competitor_id: "c2", rotulo: null, team: { nome: "Beta", escudo_url: null } },
]

describe("getMuralha", () => {
  // O ponto MAIS SUTIL da change (design, Decisão 2): o shim mapeia
  // `woVencedor` GATEADO em `m.wo`. Um `wo_vencedor` RESIDUAL num match NÃO-W.O.
  // não pode disparar o ramo de W.O. em `resultadoDoLado` e matar um clean sheet.
  it("gate m.wo: wo_vencedor RESIDUAL em match não-W.O. NÃO mata o clean sheet", async () => {
    const { client } = mockClient({
      matches: {
        data: [
          {
            id: "m1",
            vaga_1: "s1",
            vaga_2: "s2",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            wo: false, // NÃO é W.O.
            wo_vencedor: "s1", // resíduo — deve ser IGNORADO (gate em m.wo)
            wo_duplo: false,
          },
        ],
      },
      tournament_slots: { data: SLOTS },
    })
    const r = await getMuralha(client, { tournamentIds: ["t1"] })
    // 0x0 REAL → clean sheet creditado para os DOIS lados.
    expect(r).toHaveLength(2)
    for (const linha of r) {
      expect(linha).toMatchObject({ jogos: 1, cleanSheets: 1, golsSofridos: 0 })
    }
  })

  it("W.O. de verdade (m.wo:true): o lado é PULADO (não conta jogo/cs/gols)", async () => {
    const { client } = mockClient({
      matches: {
        data: [
          {
            id: "m1",
            vaga_1: "s1",
            vaga_2: "s2",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            wo: true,
            wo_vencedor: "s1",
            wo_duplo: false,
          },
        ],
      },
      tournament_slots: { data: SLOTS },
    })
    const r = await getMuralha(client, { tournamentIds: ["t1"] })
    expect(r).toEqual([])
  })
})
