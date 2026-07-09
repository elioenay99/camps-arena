import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getTecnicoCampanha } from "@/features/league/data/getTecnicoCampanha"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

interface TenureRow {
  slot_id: string
  competitor_id?: string
  user_id?: string | null
  rodada_inicio: number | null
  rodada_fim: number | null
}
interface MatchRow {
  id: string
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  rodada: number | null
  wo: boolean
  wo_vencedor: string | null
  wo_duplo: boolean
}

/**
 * Mock que diferencia `coach_tenures` pelo método: `.eq("user_id", …)` (tenures do
 * técnico) vs `.in("slot_id", …)` (tenures das vagas opostas). `matches` e
 * `users_public` resolvem direto.
 */
function mockClient(opts: {
  tenuresTecnico: TenureRow[]
  matches: MatchRow[]
  tenuresOpostas?: TenureRow[]
  perfis?: { id: string; nome: string | null; avatar: string | null }[]
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
        const porUser = log.some((a) => a[0] === "eq" && a[1] === "user_id")
        const data = porUser ? opts.tenuresTecnico : (opts.tenuresOpostas ?? [])
        return resolve({ data, error: null })
      }
      if (table === "matches") return resolve({ data: opts.matches, error: null })
      if (table === "users_public") return resolve({ data: opts.perfis ?? [], error: null })
      return resolve({ data: [], error: null })
    }
    return builder
  }
  return { from: builderFor } as unknown as ServerClient
}

const U = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function match(over: Partial<MatchRow> & { id: string }): MatchRow {
  return {
    vaga_1: null,
    vaga_2: null,
    placar_1: 0,
    placar_2: 0,
    rodada: 1,
    wo: false,
    wo_vencedor: null,
    wo_duplo: false,
    ...over,
  }
}

describe("getTecnicoCampanha", () => {
  it("credita o lado certo em cada partida (lado 1 e lado 2)", async () => {
    const client = mockClient({
      tenuresTecnico: [
        { slot_id: "s1", competitor_id: "cA", rodada_inicio: null, rodada_fim: null },
      ],
      matches: [
        match({ id: "m1", vaga_1: "s1", vaga_2: "o1", placar_1: 2, placar_2: 1, rodada: 1 }),
        match({ id: "m2", vaga_1: "o2", vaga_2: "s1", placar_1: 0, placar_2: 3, rodada: 2 }),
      ],
    })
    const { total, porClube } = await getTecnicoCampanha(client, { userId: U })
    expect(total.jogos).toBe(2)
    expect(total.vitorias).toBe(2)
    expect(total.golsPro).toBe(5) // 2 + 3
    expect(total.golsContra).toBe(1) // 1 + 0
    expect(porClube.get("cA")!.jogos).toBe(2)
  })

  it("NÃO credita partida fora da janela de comando", async () => {
    const client = mockClient({
      tenuresTecnico: [
        { slot_id: "s1", competitor_id: "cA", rodada_inicio: 6, rodada_fim: null },
      ],
      matches: [
        match({ id: "m1", vaga_1: "s1", vaga_2: "o1", placar_1: 4, placar_2: 0, rodada: 3 }),
        match({ id: "m2", vaga_1: "s1", vaga_2: "o1", placar_1: 1, placar_2: 0, rodada: 6 }),
      ],
    })
    const { total } = await getTecnicoCampanha(client, { userId: U })
    expect(total.jogos).toBe(1) // só a rodada 6
    expect(total.golsPro).toBe(1)
  })

  it("split (dois slots, mesmo competidor) soma na MESMA fatia", async () => {
    const client = mockClient({
      tenuresTecnico: [
        { slot_id: "sA", competitor_id: "cA", rodada_inicio: null, rodada_fim: null },
        { slot_id: "sB", competitor_id: "cA", rodada_inicio: null, rodada_fim: null },
      ],
      matches: [
        match({ id: "m1", vaga_1: "sA", vaga_2: "o1", placar_1: 1, placar_2: 0, rodada: 1 }),
        match({ id: "m2", vaga_1: "sB", vaga_2: "o2", placar_1: 2, placar_2: 2, rodada: 1 }),
      ],
    })
    const { porClube } = await getTecnicoCampanha(client, { userId: U })
    expect(porClube.size).toBe(1)
    expect(porClube.get("cA")!.jogos).toBe(2)
  })

  it("adversário sem conta (user_id null) fica fora da lista de adversários", async () => {
    const client = mockClient({
      tenuresTecnico: [
        { slot_id: "s1", competitor_id: "cA", rodada_inicio: null, rodada_fim: null },
      ],
      matches: [
        match({ id: "m1", vaga_1: "s1", vaga_2: "o1", placar_1: 1, placar_2: 0, rodada: 1 }),
        match({ id: "m2", vaga_1: "s1", vaga_2: "o2", placar_1: 0, placar_2: 0, rodada: 2 }),
      ],
      tenuresOpostas: [
        { slot_id: "o1", user_id: "opp-1111-1111-1111-111111111111", rodada_inicio: null, rodada_fim: null },
        { slot_id: "o2", user_id: null, rodada_inicio: null, rodada_fim: null },
      ],
      perfis: [
        { id: "opp-1111-1111-1111-111111111111", nome: "Rival", avatar: "r.png" },
      ],
    })
    const { total, adversarios } = await getTecnicoCampanha(client, { userId: U })
    expect(total.jogos).toBe(2) // os dois jogos contam na campanha
    expect(adversarios).toHaveLength(1)
    expect(adversarios[0]).toMatchObject({
      userId: "opp-1111-1111-1111-111111111111",
      nome: "Rival",
      jogos: 1,
    })
  })

  it("jogo de COPA (tenure aberta, rodada nula) entra na campanha, sob o clube de liga", async () => {
    // add-copa-tecnico-heranca: a vaga de copa herda competitor_id + user_id e abre
    // tenure totalmente aberta (rodada_inicio/fim nulos). partidaNaJanela credita a
    // partida mesmo com `rodada` nula — o jogo de copa conta na carreira, na MESMA
    // fatia do clube de liga (competitor_id compartilhado).
    const client = mockClient({
      tenuresTecnico: [
        // Vaga de liga (temporada) e vaga de copa, MESMO competidor cA.
        { slot_id: "sLiga", competitor_id: "cA", rodada_inicio: 1, rodada_fim: null },
        { slot_id: "sCopa", competitor_id: "cA", rodada_inicio: null, rodada_fim: null },
      ],
      matches: [
        match({ id: "mLiga", vaga_1: "sLiga", vaga_2: "o1", placar_1: 1, placar_2: 0, rodada: 3 }),
        // Partida de copa (mata-mata) com rodada nula: creditada pela janela aberta.
        match({ id: "mCopa", vaga_1: "o2", vaga_2: "sCopa", placar_1: 0, placar_2: 2, rodada: null }),
      ],
    })
    const { total, porClube } = await getTecnicoCampanha(client, { userId: U })
    expect(total.jogos).toBe(2)
    expect(total.vitorias).toBe(2)
    // Tudo na mesma fatia do competidor de liga.
    expect(porClube.size).toBe(1)
    expect(porClube.get("cA")!.jogos).toBe(2)
  })

  it("degrada para vazio quando o técnico não tem tenures", async () => {
    const client = mockClient({ tenuresTecnico: [], matches: [] })
    const { total, porClube, adversarios } = await getTecnicoCampanha(client, { userId: U })
    expect(total.jogos).toBe(0)
    expect(porClube.size).toBe(0)
    expect(adversarios).toEqual([])
  })
})
