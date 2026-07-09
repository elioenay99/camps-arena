import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  autoresIniciaisDaPartida,
  getGolsCrusPorPartida,
  resumoDoLado,
  type GolCru,
} from "@/features/match/data/getMatchGoals"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Mock mínimo: from("match_goals").select(...).in(...) → resolve {data,error}. */
function mockClient(resp: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {}
  for (const m of ["select", "in"]) builder[m] = () => builder
  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: resp.data ?? null, error: resp.error ?? null })
  return { from: () => builder } as unknown as ServerClient
}

describe("getGolsCrusPorPartida", () => {
  it("agrupa os gols crus por partida (preservando contra e nome nulo)", async () => {
    const client = mockClient({
      data: [
        { match_id: "m1", lado: 1, jogador: "Vini", gols: 2, contra: false },
        { match_id: "m1", lado: 1, jogador: null, gols: 1, contra: true },
        { match_id: "m2", lado: 2, jogador: "Zé", gols: 1, contra: false },
      ],
    })
    const r = await getGolsCrusPorPartida(client, ["m1", "m2"])
    expect(r).not.toBeNull()
    expect(r?.get("m1")).toEqual([
      { lado: 1, jogador: "Vini", gols: 2, contra: false },
      { lado: 1, jogador: null, gols: 1, contra: true },
    ])
    expect(r?.get("m2")).toEqual([{ lado: 2, jogador: "Zé", gols: 1, contra: false }])
  })

  it("lista vazia de ids → Map vazio (não é erro)", async () => {
    const client = mockClient({ data: [] })
    const r = await getGolsCrusPorPartida(client, [])
    expect(r).toBeInstanceOf(Map)
    expect(r?.size).toBe(0)
  })

  it("erro de IO → null (distinto de Map vazio, para não degradar para 'zero gols')", async () => {
    const client = mockClient({ error: { message: "boom" } })
    const r = await getGolsCrusPorPartida(client, ["m1"])
    expect(r).toBeNull()
  })
})

describe("resumoDoLado", () => {
  const gols: GolCru[] = [
    { lado: 1, jogador: "Vini", gols: 2, contra: false },
    { lado: 1, jogador: null, gols: 1, contra: true },
    { lado: 2, jogador: "Zé", gols: 3, contra: false },
  ]

  it("separa normais de contra e soma o total do lado", () => {
    expect(resumoDoLado(gols, 1)).toEqual({
      normais: 2,
      contra: 1,
      total: 3,
      autores: [
        { lado: 1, jogador: "Vini", gols: 2, contra: false },
        { lado: 1, jogador: null, gols: 1, contra: true },
      ],
    })
  })

  it("lado sem gols → tudo zero", () => {
    expect(resumoDoLado(undefined, 1)).toEqual({ normais: 0, contra: 0, total: 0, autores: [] })
  })
})

describe("autoresIniciaisDaPartida", () => {
  it("mapeia para {lado, jogador, gols, contra} preservando o anônimo (null)", () => {
    const gols: GolCru[] = [
      { lado: 1, jogador: "Vini", gols: 2, contra: false },
      { lado: 2, jogador: null, gols: 1, contra: true },
    ]
    expect(autoresIniciaisDaPartida(gols)).toEqual([
      { lado: 1, jogador: "Vini", gols: 2, contra: false },
      { lado: 2, jogador: null, gols: 1, contra: true },
    ])
  })

  it("undefined → lista vazia", () => {
    expect(autoresIniciaisDaPartida(undefined)).toEqual([])
  })
})
