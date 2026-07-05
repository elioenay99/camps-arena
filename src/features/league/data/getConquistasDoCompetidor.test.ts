import { describe, it, expect } from "vitest"

import { getConquistasDoCompetidor } from "./getConquistasDoCompetidor"

interface ConquistaRow {
  tipo: string
  ref_id: string
  ref_rotulo: string
  nivel: number | null
  valor_texto: string | null
  valor_num: number | null
  jogador: string | null
  conquistado_em: string
}

/** Supabase fake: from("conquistas").select().eq().order() → {data, error}. */
function fakeSupabase(rows: ConquistaRow[] | null, erro = false) {
  return {
    from(table: string) {
      if (table !== "conquistas") throw new Error(`tabela inesperada: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: erro ? null : rows, error: erro ? new Error("io") : null }),
          }),
        }),
      }
    },
  } as never
}

function row(tipo: string, refId: string, rotulo: string, extra: Partial<ConquistaRow> = {}): ConquistaRow {
  return {
    tipo,
    ref_id: refId,
    ref_rotulo: rotulo,
    nivel: null,
    valor_texto: null,
    valor_num: null,
    jogador: null,
    conquistado_em: "2026-07-05T00:00:00Z",
    ...extra,
  }
}

describe("getConquistasDoCompetidor", () => {
  it("agrupa por temporada (ref_id) preservando a ordem mais-recente-primeiro", async () => {
    const rows = [
      row("campeao", "s2", "Liga — Temporada 2", { conquistado_em: "2026-07-05T00:00:00Z" }),
      row("promovido", "s2", "Liga — Temporada 2", { conquistado_em: "2026-07-05T00:00:00Z" }),
      row("rebaixado", "s1", "Liga — Temporada 1", { conquistado_em: "2026-06-01T00:00:00Z" }),
    ]
    const grupos = await getConquistasDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })

    expect(grupos).toHaveLength(2)
    expect(grupos[0].refId).toBe("s2")
    expect(grupos[0].rotulo).toBe("Liga — Temporada 2")
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao", "promovido"])
    expect(grupos[1].refId).toBe("s1")
  })

  it("ordena os troféus dentro da temporada (campeão antes de rebaixado)", async () => {
    const rows = [
      row("rebaixado", "s1", "Liga — T1"),
      row("artilheiro", "s1", "Liga — T1", { jogador: "Endrick", valor_num: 12 }),
      row("campeao", "s1", "Liga — T1", { valor_texto: "Série A", nivel: 1 }),
    ]
    const grupos = await getConquistasDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao", "artilheiro", "rebaixado"])
  })

  it("mapeia os campos do troféu (valor/jogador)", async () => {
    const rows = [row("artilheiro", "s1", "Liga — T1", { jogador: "Vini", valor_num: 23 })]
    const grupos = await getConquistasDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })
    expect(grupos[0].trofeus[0]).toMatchObject({ tipo: "artilheiro", jogador: "Vini", valorNum: 23 })
  })

  it("erro de IO ⇒ [] (degrada sem quebrar)", async () => {
    expect(await getConquistasDoCompetidor(fakeSupabase(null, true), { competitorId: "c1" })).toEqual([])
  })

  it("sem troféus ⇒ []", async () => {
    expect(await getConquistasDoCompetidor(fakeSupabase([]), { competitorId: "c1" })).toEqual([])
  })
})
