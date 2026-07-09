import { describe, it, expect } from "vitest"

import { getConquistasDoTecnico } from "./getConquistasDoTecnico"

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Chain thenable que resolve para `result` em qualquer terminal (is/in/order/eq). */
function makeChain(result: any) {
  const chain: any = {}
  for (const m of ["select", "eq", "is", "in", "order"]) chain[m] = () => chain
  chain.then = (onF: any, onR: any) => Promise.resolve(result).then(onF, onR)
  return chain
}

function fakeSupabase(byTable: Record<string, any>) {
  return {
    from(table: string) {
      return makeChain(byTable[table] ?? { data: [], error: null })
    },
  } as never
}

/** Tenure de Apertura/Clausura (com `division` embutida). */
function tenureDiv(
  competitorId: string,
  tournamentId: string,
  div: {
    id: string
    season_id: string
    tournament_id: string | null
    tournament_id_clausura: string | null
    final_tournament_id: string | null
  }
) {
  return {
    competitor_id: competitorId,
    season_id: div.season_id,
    tournament_id: tournamentId,
    division_season_id: div.id,
    division: div,
  }
}

/** Tenure de GRANDE FINAL (division nulo, season_id nulo, tournament_id = final). */
function tenureFinal(competitorId: string, finalTournamentId: string) {
  return {
    competitor_id: competitorId,
    season_id: null,
    tournament_id: finalTournamentId,
    division_season_id: null,
    division: null,
  }
}

function conquista(competitorId: string, refId: string, tipo: string, clube: string, extra: any = {}) {
  return {
    competitor_id: competitorId,
    ref_id: refId,
    ref_rotulo: "Liga — T3",
    tipo,
    nivel: 1,
    valor_texto: null,
    valor_num: null,
    jogador: null,
    conquistado_em: "2026-07-05T00:00:00Z",
    competitor: { rotulo: null, team: { nome: clube } },
    ...extra,
  }
}

describe("getConquistasDoTecnico", () => {
  it("SPLIT: o técnico vigente na GRANDE FINAL herda o troféu (via final→season)", async () => {
    const divSplit = {
      id: "d1",
      season_id: "sX",
      tournament_id: "tA",
      tournament_id_clausura: "tC",
      final_tournament_id: "tF",
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        // u1 comandou a Apertura E é o vigente da grande final.
        coach_tenures: {
          data: [tenureDiv("cham", "tA", divSplit), tenureFinal("cham", "tF")],
          error: null,
        },
        league_division_seasons: {
          data: [{ season_id: "sX", final_tournament_id: "tF" }],
          error: null,
        },
        conquistas: {
          data: [conquista("cham", "sX", "campeao", "Chamocas", { valor_texto: "Série A" })],
          error: null,
        },
      }),
      { userId: "u1" }
    )
    // Um único grupo (dedup do par cham|sX), com o clube no rótulo.
    expect(grupos).toHaveLength(1)
    expect(grupos[0].refId).toBe("cham|sX")
    expect(grupos[0].rotulo).toBe("Chamocas · Liga — T3")
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao"])
  })

  it("SPLIT: técnico SÓ da Apertura NÃO herda o título (decisivo = grande final)", async () => {
    const divSplit = {
      id: "d1",
      season_id: "sX",
      tournament_id: "tA",
      tournament_id_clausura: "tC",
      final_tournament_id: "tF",
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        // u2 comandou APENAS a Apertura; a grande final foi de outro técnico.
        coach_tenures: { data: [tenureDiv("cham", "tA", divSplit)], error: null },
        conquistas: { data: [conquista("cham", "sX", "campeao", "Chamocas")], error: null },
      }),
      { userId: "u2" }
    )
    expect(grupos).toEqual([])
  })

  it("SPLIT com grande final: NÃO-finalista (rebaixado) herda pelo ÚLTIMO TURNO REGULAR (Clausura)", async () => {
    const divSplit = {
      id: "d1",
      season_id: "sX",
      tournament_id: "tA",
      tournament_id_clausura: "tC",
      final_tournament_id: "tF",
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        // uR comandou "reb" na Apertura E na Clausura; reb NÃO é finalista (sem
        // tenure de grande final). Antes do fix, o troféu dele era descartado.
        coach_tenures: {
          data: [tenureDiv("reb", "tA", divSplit), tenureDiv("reb", "tC", divSplit)],
          error: null,
        },
        conquistas: {
          data: [
            conquista("reb", "sX", "rebaixado", "Rebaixados"),
            conquista("reb", "sX", "artilheiro", "Rebaixados", { valor_num: 15, jogador: "Kaká" }),
          ],
          error: null,
        },
      }),
      { userId: "uR" }
    )
    // Herda os troféus GERAIS (rebaixado + artilheiro) pela Clausura.
    expect(grupos).toHaveLength(1)
    expect(grupos[0].refId).toBe("reb|sX")
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["artilheiro", "rebaixado"])
  })

  it("SPLIT: campeão herda TÍTULO pela grande final E os GERAIS pela Clausura", async () => {
    const divSplit = {
      id: "d1",
      season_id: "sX",
      tournament_id: "tA",
      tournament_id_clausura: "tC",
      final_tournament_id: "tF",
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        // uF comandou "cham" na Clausura (turno regular) E foi o técnico da final.
        coach_tenures: {
          data: [tenureDiv("cham", "tC", divSplit), tenureFinal("cham", "tF")],
          error: null,
        },
        league_division_seasons: {
          data: [{ season_id: "sX", final_tournament_id: "tF" }],
          error: null,
        },
        conquistas: {
          data: [
            conquista("cham", "sX", "campeao", "Chamocas", { valor_texto: "Série A" }),
            conquista("cham", "sX", "melhor_ataque", "Chamocas"),
          ],
          error: null,
        },
      }),
      { userId: "uF" }
    )
    // campeão (título, via final) + melhor_ataque (geral, via Clausura).
    expect(grupos).toHaveLength(1)
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao", "melhor_ataque"])
  })

  it("SPLIT campeão DIRETO (sem final): decisivo = Clausura; Apertura não conta", async () => {
    const divDireto = {
      id: "d2",
      season_id: "sD",
      tournament_id: "tAp",
      tournament_id_clausura: "tCl",
      final_tournament_id: null,
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        // u3 comandou os DOIS turnos: a Apertura (skip) e a Clausura (decisivo).
        coach_tenures: {
          data: [tenureDiv("cD", "tAp", divDireto), tenureDiv("cD", "tCl", divDireto)],
          error: null,
        },
        conquistas: {
          data: [
            conquista("cD", "sD", "campeao", "Diretos"),
            conquista("cD", "sD", "promovido", "Diretos"),
          ],
          error: null,
        },
      }),
      { userId: "u3" }
    )
    // Um só grupo (dedup cD|sD), com os dois troféus da temporada.
    expect(grupos).toHaveLength(1)
    expect(grupos[0].refId).toBe("cD|sD")
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao", "promovido"])
  })

  it("ANUAL: a única tenure é o torneio decisivo → herda", async () => {
    const divAnual = {
      id: "dA",
      season_id: "sA",
      tournament_id: "tAA",
      tournament_id_clausura: null,
      final_tournament_id: null,
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        coach_tenures: { data: [tenureDiv("cA", "tAA", divAnual)], error: null },
        conquistas: { data: [conquista("cA", "sA", "campeao", "Anuais")], error: null },
      }),
      { userId: "u4" }
    )
    expect(grupos).toHaveLength(1)
    expect(grupos[0].trofeus.map((t) => t.tipo)).toEqual(["campeao"])
  })

  it("filtra conquistas fora dos pares vencedores (over-fetch defensivo)", async () => {
    const divAnual = {
      id: "dA",
      season_id: "sA",
      tournament_id: "tAA",
      tournament_id_clausura: null,
      final_tournament_id: null,
    }
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        coach_tenures: { data: [tenureDiv("cA", "tAA", divAnual)], error: null },
        conquistas: {
          data: [
            conquista("cA", "sA", "campeao", "Anuais"),
            // par que NÃO é do técnico (outro competidor) — deve ser filtrado.
            conquista("outro", "sA", "campeao", "Outro"),
          ],
          error: null,
        },
      }),
      { userId: "u5" }
    )
    expect(grupos).toHaveLength(1)
    expect(grupos[0].refId).toBe("cA|sA")
  })

  it("tenure de copa (season nula, torneio não-final) NÃO herda troféu de liga", async () => {
    // add-copa-tecnico-heranca: a tenure de copa tem division/season nulos e
    // tournament_id de copa (não é final_tournament_id de divisão nenhuma). Cruza
    // (competitor_id, season_id) → não casa season → sem troféu falso.
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({
        coach_tenures: { data: [tenureFinal("cCopa", "tCopa")], error: null },
        // Nenhuma divisão tem final_tournament_id = 'tCopa'.
        league_division_seasons: { data: [], error: null },
        // Mesmo que houvesse uma conquista do competidor, sem par-título não entra.
        conquistas: { data: [conquista("cCopa", "sX", "campeao", "CopaClube")], error: null },
      }),
      { userId: "uCopa" }
    )
    expect(grupos).toEqual([])
  })

  it("sem tenures vigentes ⇒ [] (sem herança)", async () => {
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({ coach_tenures: { data: [], error: null } }),
      { userId: "u6" }
    )
    expect(grupos).toEqual([])
  })

  it("erro ao ler tenures ⇒ []", async () => {
    const grupos = await getConquistasDoTecnico(
      fakeSupabase({ coach_tenures: { data: null, error: new Error("io") } }),
      { userId: "u7" }
    )
    expect(grupos).toEqual([])
  })
})
