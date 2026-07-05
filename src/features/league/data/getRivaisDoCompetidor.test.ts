import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getRivaisDoCompetidor } from "@/features/league/data/getRivaisDoCompetidor"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

describe("getRivaisDoCompetidor", () => {
  it("vazio quando o competidor não existe", async () => {
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ["select", "eq", "neq"]) b[m] = () => b
        b.maybeSingle = () => Promise.resolve({ data: null, error: null })
        b.then = (r: (v: unknown) => unknown) => r({ data: [], error: null })
        return b
      },
    } as unknown as ServerClient
    expect(await getRivaisDoCompetidor(client, { competitorId: C })).toEqual([])
  })

  it("lista rivais da mesma competição, exclui o próprio (neq) e ordena por nome", async () => {
    const neqArgs: unknown[][] = []
    const client = {
      from: () => {
        const b: Record<string, unknown> = {}
        for (const m of ["select", "eq"]) b[m] = () => b
        b.neq = (...args: unknown[]) => {
          neqArgs.push(args)
          return b
        }
        // 1ª chamada: competição do competidor (maybeSingle).
        b.maybeSingle = () =>
          Promise.resolve({ data: { competition_id: "comp1" }, error: null })
        // 2ª chamada: lista de rivais (await direto).
        b.then = (r: (v: unknown) => unknown) =>
          r({
            data: [
              { id: "r2", rotulo: null, team: { nome: "Zeta FC", escudo_url: "z.png" } },
              { id: "r1", rotulo: "Alfa", team: null },
            ],
            error: null,
          })
        return b
      },
    } as unknown as ServerClient

    const r = await getRivaisDoCompetidor(client, { competitorId: C })
    // ordena por nome; mapeia rótulo/clube + escudo
    expect(r).toEqual([
      { id: "r1", nome: "Alfa", escudoUrl: null },
      { id: "r2", nome: "Zeta FC", escudoUrl: "z.png" },
    ])
    // excluiu o próprio competidor via .neq("id", competitorId)
    expect(neqArgs).toContainEqual(["id", C])
  })
})
