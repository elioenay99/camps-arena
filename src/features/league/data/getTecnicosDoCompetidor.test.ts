import { describe, it, expect } from "vitest"

import { getTecnicosDoCompetidor } from "./getTecnicosDoCompetidor"

interface Row {
  user_id: string | null
  nome: string | null
  rodada_inicio: number | null
  rodada_fim: number | null
  encerrada_em: string | null
  season_id: string | null
  tournament_id: string
  tecnico: { id: string; nome: string | null } | null
  season: { numero: number } | null
}

interface DivRow {
  final_tournament_id: string
  season_id: string
  season: { numero: number } | null
}

/**
 * Supabase fake: coach_tenures (select→eq) + league_division_seasons (select→in).
 */
function fakeSupabase(rows: Row[] | null, opts: { erro?: boolean; divs?: DivRow[] } = {}) {
  const result = { data: opts.erro ? null : rows, error: opts.erro ? new Error("io") : null }
  const divsResult = { data: opts.divs ?? [], error: null }
  return {
    from(table: string) {
      if (table === "coach_tenures") {
        const chain = { select: () => chain, eq: () => Promise.resolve(result) }
        return chain
      }
      if (table === "league_division_seasons") {
        const chain = { select: () => chain, in: () => Promise.resolve(divsResult) }
        return chain
      }
      throw new Error(`tabela inesperada: ${table}`)
    },
  } as never
}

function row(extra: Partial<Row>): Row {
  return {
    user_id: null,
    nome: null,
    rodada_inicio: null,
    rodada_fim: null,
    encerrada_em: null,
    season_id: null,
    tournament_id: "tReg",
    tecnico: null,
    season: null,
    ...extra,
  }
}

describe("getTecnicosDoCompetidor", () => {
  it("agrupa por temporada (mais recente primeiro) e ordena as passagens por rodada", async () => {
    const rows = [
      // Temporada 2: A (rod 1..5, fechada) depois B (rod 5, vigente).
      row({
        user_id: "uB",
        tecnico: { id: "uB", nome: "Bianca" },
        rodada_inicio: 5,
        encerrada_em: null,
        season_id: "s2",
        season: { numero: 2 },
      }),
      row({
        user_id: "uA",
        tecnico: { id: "uA", nome: "Ana" },
        rodada_inicio: 1,
        rodada_fim: 5,
        encerrada_em: "2026-06-10T00:00:00Z",
        season_id: "s2",
        season: { numero: 2 },
      }),
      // Temporada 1: técnico local (por nome).
      row({
        user_id: null,
        nome: "Comando Local",
        season_id: "s1",
        season: { numero: 1 },
        encerrada_em: "2026-05-01T00:00:00Z",
        rodada_fim: 10,
      }),
    ]
    const grupos = await getTecnicosDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })

    expect(grupos).toHaveLength(2)
    expect(grupos[0].numero).toBe(2)
    expect(grupos[1].numero).toBe(1)
    expect(grupos[0].passagens.map((p) => p.userId)).toEqual(["uA", "uB"])
    expect(grupos[0].passagens[0].vigente).toBe(false)
    expect(grupos[0].passagens[1].vigente).toBe(true)
    expect(grupos[0].passagens[1].nome).toBe("Bianca")
  })

  it("técnico local (por nome): user_id null + nome ⇒ porNome, nome do rótulo, sem link", async () => {
    const rows = [
      row({ user_id: null, nome: "Comando Local", season_id: "s1", season: { numero: 1 } }),
    ]
    const [g] = await getTecnicosDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })
    expect(g.passagens[0]).toMatchObject({
      userId: null,
      nome: "Comando Local",
      porNome: true,
      removido: false,
    })
  })

  it("técnico removido (cascade): user_id null + nome null ⇒ removido, nome null", async () => {
    const rows = [
      row({ user_id: null, nome: null, season_id: "s1", season: { numero: 1 } }),
    ]
    const [g] = await getTecnicosDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })
    expect(g.passagens[0]).toMatchObject({
      userId: null,
      nome: null,
      porNome: false,
      removido: true,
    })
  })

  it("conta global: usa o nome do join users e mantém o link (userId)", async () => {
    const rows = [
      row({
        user_id: "u1",
        tecnico: { id: "u1", nome: "Ana" },
        season_id: "s1",
        season: { numero: 1 },
      }),
    ]
    const [g] = await getTecnicosDoCompetidor(fakeSupabase(rows), { competitorId: "c1" })
    expect(g.passagens[0]).toMatchObject({ userId: "u1", nome: "Ana", porNome: false })
  })

  it("SPLIT: a tenure da GRANDE FINAL (season_id NULL) agrupa na Temporada certa e o finalista é deduplicado", async () => {
    const rows = [
      // Clausura (turno regular) do finalista Fábio na Temporada 3.
      row({
        user_id: "uF",
        tecnico: { id: "uF", nome: "Fábio" },
        rodada_inicio: 1,
        encerrada_em: null,
        season_id: "s3",
        season: { numero: 3 },
        tournament_id: "tClausura",
      }),
      // Grande final: MESMO técnico Fábio, season_id NULL (mapeado por final→season).
      row({
        user_id: "uF",
        tecnico: { id: "uF", nome: "Fábio" },
        encerrada_em: null,
        season_id: null,
        tournament_id: "tFinal",
      }),
    ]
    const grupos = await getTecnicosDoCompetidor(fakeSupabase(rows, {
      divs: [{ final_tournament_id: "tFinal", season_id: "s3", season: { numero: 3 } }],
    }), { competitorId: "c1" })

    // Um único grupo (Temporada 3), SEM bucket "Sem temporada"; finalista aparece 1x.
    expect(grupos).toHaveLength(1)
    expect(grupos[0].numero).toBe(3)
    expect(grupos[0].seasonId).toBe("s3")
    expect(grupos[0].passagens).toHaveLength(1)
    expect(grupos[0].passagens[0].userId).toBe("uF")
  })

  it("SPLIT: técnico DISTINTO na grande final entra como passagem própria, por último", async () => {
    const rows = [
      row({
        user_id: "uC",
        tecnico: { id: "uC", nome: "Clara" },
        rodada_inicio: 1,
        encerrada_em: null,
        season_id: "s3",
        season: { numero: 3 },
        tournament_id: "tClausura",
      }),
      row({
        user_id: "uD",
        tecnico: { id: "uD", nome: "Dora" },
        encerrada_em: null,
        season_id: null,
        tournament_id: "tFinal",
      }),
    ]
    const grupos = await getTecnicosDoCompetidor(fakeSupabase(rows, {
      divs: [{ final_tournament_id: "tFinal", season_id: "s3", season: { numero: 3 } }],
    }), { competitorId: "c1" })

    expect(grupos).toHaveLength(1)
    expect(grupos[0].passagens.map((p) => p.userId)).toEqual(["uC", "uD"])
    // A passagem da grande final vem por último e marca decisorFinal.
    expect(grupos[0].passagens[1].decisorFinal).toBe(true)
  })

  it("playoff/barragem (season_id NULL, não é grande final) são descartados", async () => {
    const rows = [
      row({
        user_id: "uA",
        tecnico: { id: "uA", nome: "Ana" },
        season_id: "s2",
        season: { numero: 2 },
        tournament_id: "tReg",
      }),
      // Tenure de playoff: season_id NULL e NÃO casa nenhum final_tournament_id.
      row({ user_id: "uA", tecnico: { id: "uA", nome: "Ana" }, season_id: null, tournament_id: "tPlayoff" }),
    ]
    const grupos = await getTecnicosDoCompetidor(fakeSupabase(rows, { divs: [] }), {
      competitorId: "c1",
    })
    // Só a Temporada 2 (o playoff é descartado, sem bucket "Sem temporada").
    expect(grupos).toHaveLength(1)
    expect(grupos[0].numero).toBe(2)
    expect(grupos[0].passagens).toHaveLength(1)
  })

  it("erro de IO ⇒ [] (degrada sem quebrar)", async () => {
    expect(await getTecnicosDoCompetidor(fakeSupabase(null, { erro: true }), { competitorId: "c1" })).toEqual([])
  })

  it("sem passagens ⇒ []", async () => {
    expect(await getTecnicosDoCompetidor(fakeSupabase([]), { competitorId: "c1" })).toEqual([])
  })
})
