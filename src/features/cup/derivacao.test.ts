import { describe, expect, it } from "vitest"

import {
  chaveDaOrigem,
  derivarPool,
  identidadeDe,
  validarGeometriaCopa,
  type AncoraManual,
  type LerOrigem,
} from "@/features/cup/derivacao"
import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"

import type {
  IdentidadeParticipante,
  OrigemClassificacao,
  RegraQualificacao,
} from "@/features/cup/types"

/* -------------------------------------------------------------------------- */
/* Fábricas de teste                                                            */
/* -------------------------------------------------------------------------- */

/** Regra origem DIVISÃO mínima. */
function regraDivisao(over: {
  id: string
  competition: string
  nivel: number
  inicio: number
  fim: number
  prioridade?: number
  rotulo?: string | null
}): RegraQualificacao {
  return {
    id: over.id,
    cup_competition_id: "copa-1",
    origem_tipo: "divisao",
    origem_competition_id: over.competition,
    origem_nivel: over.nivel,
    origem_cup_id: null,
    posicao_inicio: over.inicio,
    posicao_fim: over.fim,
    prioridade: over.prioridade ?? 0,
    rotulo: over.rotulo ?? null,
    created_at: "2026-01-01T00:00:00Z",
  }
}

/** Regra origem COPA mínima. */
function regraCopa(over: {
  id: string
  cupId: string
  inicio: number
  fim: number
  prioridade?: number
  rotulo?: string | null
}): RegraQualificacao {
  return {
    id: over.id,
    cup_competition_id: "copa-1",
    origem_tipo: "copa",
    origem_competition_id: null,
    origem_nivel: null,
    origem_cup_id: over.cupId,
    posicao_inicio: over.inicio,
    posicao_fim: over.fim,
    prioridade: over.prioridade ?? 0,
    rotulo: over.rotulo ?? null,
    created_at: "2026-01-01T00:00:00Z",
  }
}

/**
 * Cria uma origem com `posicoes` clubes (modo clube), rank contíguo 1..n na
 * ordem dada. `posicoes[i]` = posicao_final crua (para testar empate/lacuna),
 * default = i+1.
 */
function origemClubes(
  ids: string[],
  posicoes?: number[],
  seasonId = "season-x"
): OrigemClassificacao[] {
  return ids.map((id, i) => ({
    team_id: id,
    rotulo: null,
    posicao_final: posicoes?.[i] ?? i + 1,
    rank: i + 1,
    origem_season_id: seasonId,
  }))
}

/** Origem por rótulos (modo por nome). */
function origemRotulos(rotulos: string[], seasonId = "season-r"): OrigemClassificacao[] {
  return rotulos.map((r, i) => ({
    team_id: null,
    rotulo: r,
    posicao_final: i + 1,
    rank: i + 1,
    origem_season_id: seasonId,
  }))
}

/** `lerOrigem` injetado: roteia por chave de origem. */
function lerOrigemDe(mapa: Record<string, OrigemClassificacao[]>): LerOrigem {
  return (regra) => mapa[chaveDaOrigem(regra)] ?? []
}

const semExclusoes = new Set<IdentidadeParticipante>()
const semManuais: AncoraManual[] = []

const teams = (n: number) =>
  Array.from({ length: n }, (_, i) => `team-${String(i + 1).padStart(2, "0")}`)

/* -------------------------------------------------------------------------- */
/* validarGeometriaCopa                                                         */
/* -------------------------------------------------------------------------- */

describe("validarGeometriaCopa — mata-mata (2..32)", () => {
  it("aceita 2..32", () => {
    for (const n of [2, 3, 8, 16, 31, 32]) {
      expect(validarGeometriaCopa("mata_mata", n).ok).toBe(true)
    }
  })

  it("recusa < 2 com COPA_SEM_PARTICIPANTES_SUFICIENTES", () => {
    const r = validarGeometriaCopa("mata_mata", 1)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_SEM_PARTICIPANTES_SUFICIENTES")
  })

  it("recusa > 32 com COPA_LOTADA (teto do motor)", () => {
    const r = validarGeometriaCopa("mata_mata", MATA_MATA_MAX_PARTICIPANTES + 1)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_LOTADA")
  })
})

describe("validarGeometriaCopa — grupos+mata (geometria)", () => {
  it("aceita geometria que fecha a chave (8 em 2 grupos, 2 classificados)", () => {
    expect(validarGeometriaCopa("grupos_mata_mata", 8, 2, 2).ok).toBe(true)
  })

  it("aceita 20 participantes em 4 grupos (5 por grupo), 4 classificados → chave de 16", () => {
    // G·K = 4×4 = 16 (potência de 2); menor grupo = 5 > K=4 (motor exige K < grupo).
    expect(validarGeometriaCopa("grupos_mata_mata", 20, 4, 4).ok).toBe(true)
  })

  it("recusa K igual ao tamanho do grupo (16 em 4 grupos, 4 classificados — sem eliminação)", () => {
    // Menor grupo = 4, K=4: classificar todos não é eliminatória → recusa.
    const r = validarGeometriaCopa("grupos_mata_mata", 16, 4, 4)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_GEOMETRIA_INVALIDA")
  })

  it("recusa geometria ausente", () => {
    const r = validarGeometriaCopa("grupos_mata_mata", 8, null, null)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_GEOMETRIA_INVALIDA")
  })

  it("recusa produto não potência de 2 (2 grupos × 3 classificados = 6)", () => {
    const r = validarGeometriaCopa("grupos_mata_mata", 12, 2, 3)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_GEOMETRIA_INVALIDA")
  })

  it("recusa N que não preenche grupos (3 participantes em 2 grupos)", () => {
    const r = validarGeometriaCopa("grupos_mata_mata", 3, 2, 1)
    expect(r.ok).toBe(false)
    expect(r.erro).toBe("COPA_GEOMETRIA_INVALIDA")
  })
})

/* -------------------------------------------------------------------------- */
/* identidadeDe / chaveDaOrigem                                                  */
/* -------------------------------------------------------------------------- */

describe("identidadeDe", () => {
  it("clube usa prefixo t:; rótulo normaliza trim+lower com prefixo r:", () => {
    expect(identidadeDe("abc", null)).toBe("t:abc")
    expect(identidadeDe(null, "  Flamengo ")).toBe("r:flamengo")
    expect(identidadeDe(null, "FLAMENGO")).toBe("r:flamengo")
  })

  it("rótulos com mesma normalização colapsam na mesma identidade", () => {
    expect(identidadeDe(null, "São Paulo")).toBe(identidadeDe(null, "  são paulo  "))
  })
})

describe("chaveDaOrigem", () => {
  it("divisão = competition:nivel; copa = cup:id (cursores independentes)", () => {
    expect(
      chaveDaOrigem(regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 4 }))
    ).toBe("div:p1:1")
    expect(chaveDaOrigem(regraCopa({ id: "r2", cupId: "c9", inicio: 1, fim: 1 }))).toBe("cup:c9")
  })
})

/* -------------------------------------------------------------------------- */
/* derivarPool — faixa básica                                                   */
/* -------------------------------------------------------------------------- */

describe("derivarPool — faixa 1..4 sobre rank de seeding (empate e lacuna na origem)", () => {
  it("seleciona os 4 primeiros do rank, ignorando empates/lacunas no valor cru", () => {
    // posicao_final crua com empates e lacunas (1,1,3,3,5) — o rank é 1..5.
    const origem = origemClubes(teams(5), [1, 1, 3, 3, 5])
    const regras = [regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 4 })]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": origem }), semManuais, semExclusoes)

    expect(pool.lacunas).toHaveLength(0)
    expect(pool.entradas.map((e) => e.team_id)).toEqual([
      "team-01",
      "team-02",
      "team-03",
      "team-04",
    ])
    // Seed sequencial contíguo 1..4.
    expect(pool.entradas.map((e) => e.seed)).toEqual([1, 2, 3, 4])
  })
})

describe("derivarPool — origem esgotada vira lacuna (sem placeholder)", () => {
  it("pede 1..4 de uma origem com só 2 → 2 entradas + 2 lacunas", () => {
    const origem = origemClubes(teams(2))
    const regras = [
      regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 4, rotulo: "Série A" }),
    ]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": origem }), semManuais, semExclusoes)

    expect(pool.entradas.map((e) => e.team_id)).toEqual(["team-01", "team-02"])
    expect(pool.lacunas).toHaveLength(2)
    expect(pool.lacunas.every((l) => l.origem_rule_id === "r1")).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* derivarPool — dedup com cursor por origem                                    */
/* -------------------------------------------------------------------------- */

describe("derivarPool — dedup por prioridade com queda (cursor por origem)", () => {
  it("clube que se qualifica por 2 regras fica na de maior prioridade; a outra cai para o próximo da origem", () => {
    // Origem A (liga): team-01 é 1º. Origem B (copa): team-01 é campeão (rank 1),
    // team-09 é vice (rank 2).
    const ligaA = origemClubes(["team-01", "team-02", "team-03"])
    const copaB = origemClubes(["team-01", "team-09"])

    const regras = [
      // prioridade 0 (alta): top-1 da liga A.
      regraDivisao({ id: "rA", competition: "pA", nivel: 1, inicio: 1, fim: 1, prioridade: 0 }),
      // prioridade 10 (baixa): campeão da copa B (rank 1).
      regraCopa({ id: "rB", cupId: "cB", inicio: 1, fim: 1, prioridade: 10 }),
    ]
    const pool = derivarPool(
      regras,
      lerOrigemDe({ "div:pA:1": ligaA, "cup:cB": copaB }),
      semManuais,
      semExclusoes
    )

    // team-01 ocupa a vaga da regra A (prioridade alta). A regra B, ao ver
    // team-01 já alocado, CAI para o próximo da origem B (team-09 = vice).
    const ids = pool.entradas.map((e) => e.team_id)
    expect(ids).toEqual(["team-01", "team-09"])
    expect(pool.lacunas).toHaveLength(0)
    // A entrada de team-01 veio da regra A; a de team-09 da regra B.
    const e01 = pool.entradas.find((e) => e.team_id === "team-01")!
    const e09 = pool.entradas.find((e) => e.team_id === "team-09")!
    expect(e01.origem_rule_id).toBe("rA")
    expect(e09.origem_rule_id).toBe("rB")
  })

  it("duas regras da MESMA origem compartilham o cursor (sem duplicar, sem pular)", () => {
    // Liga com 6 clubes. Regra X = 1..2 (prioridade 0); Regra Y = 1..3 (prioridade 5),
    // MESMA origem. Y compartilha o cursor: como 1 e 2 já foram por X, Y começa no
    // rank ainda livre e pega 3,4,5 (3 vagas), sem repetir 1/2.
    const liga = origemClubes(teams(6))
    const regras = [
      regraDivisao({ id: "rX", competition: "p1", nivel: 1, inicio: 1, fim: 2, prioridade: 0 }),
      regraDivisao({ id: "rY", competition: "p1", nivel: 1, inicio: 1, fim: 3, prioridade: 5 }),
    ]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), semManuais, semExclusoes)

    const ids = pool.entradas.map((e) => e.team_id)
    // X pega 01,02; Y (cursor compartilhado) cai para 03,04,05.
    expect(ids).toEqual(["team-01", "team-02", "team-03", "team-04", "team-05"])
    // Sem duplicatas.
    expect(new Set(ids).size).toBe(ids.length)
    expect(pool.lacunas).toHaveLength(0)
  })

  it("regra de prioridade ALTA com rankAlvo MAIOR não esconde ranks baixos livres de regra de prioridade baixa (mesma origem)", () => {
    // Regressão (HIGH 1): com cursor monotônico compartilhado, a regra A (prio 0,
    // faixa 4..4) avançava o cursor para 5, e a regra B (prio 10, faixa 1..3) só
    // varria de 5 em diante — ranks 1,2,3 ainda livres viravam lacunas espúrias.
    // Sem cursor: cada vaga parte do próprio rankAlvo; o pool fica [4,1,2,3], 0 lacunas.
    const liga = origemClubes(teams(6))
    const regras = [
      // Prioridade ALTA (0): SÓ o rank 4.
      regraDivisao({ id: "rA", competition: "p1", nivel: 1, inicio: 4, fim: 4, prioridade: 0 }),
      // Prioridade BAIXA (10): ranks 1..3 — MESMA origem.
      regraDivisao({ id: "rB", competition: "p1", nivel: 1, inicio: 1, fim: 3, prioridade: 10 }),
    ]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), semManuais, semExclusoes)

    // Ordem da varredura: rA@4 primeiro (prioridade alta), depois rB@1, rB@2, rB@3.
    expect(pool.entradas.map((e) => e.team_id)).toEqual([
      "team-04",
      "team-01",
      "team-02",
      "team-03",
    ])
    expect(pool.lacunas).toHaveLength(0)
    // O rank 4 veio de rA; os ranks 1..3 de rB.
    const e04 = pool.entradas.find((e) => e.team_id === "team-04")!
    expect(e04.origem_rule_id).toBe("rA")
    expect(pool.entradas.filter((e) => e.origem_rule_id === "rB").map((e) => e.team_id)).toEqual([
      "team-01",
      "team-02",
      "team-03",
    ])
  })

  it("origens DISTINTAS têm cursores independentes (mesmo clube pode aparecer? não — identidade global)", () => {
    // Liga A: team-01,02. Liga B: team-01,03. team-01 está em ambas. A regra de A
    // (prioridade 0) pega team-01; a de B (prioridade 5) vê team-01 alocado e
    // CAI para team-03 (cursor de B independente, mas a identidade é global).
    const ligaA = origemClubes(["team-01", "team-02"])
    const ligaB = origemClubes(["team-01", "team-03"])
    const regras = [
      regraDivisao({ id: "rA", competition: "pA", nivel: 1, inicio: 1, fim: 1, prioridade: 0 }),
      regraDivisao({ id: "rB", competition: "pB", nivel: 1, inicio: 1, fim: 1, prioridade: 5 }),
    ]
    const pool = derivarPool(
      regras,
      lerOrigemDe({ "div:pA:1": ligaA, "div:pB:1": ligaB }),
      semManuais,
      semExclusoes
    )
    expect(pool.entradas.map((e) => e.team_id)).toEqual(["team-01", "team-03"])
    expect(pool.lacunas).toHaveLength(0)
  })
})

/* -------------------------------------------------------------------------- */
/* derivarPool — âncoras manuais                                                */
/* -------------------------------------------------------------------------- */

describe("derivarPool — manuais como âncora", () => {
  it("âncora manual entra primeiro, consome identidade e a derivação cai para o próximo", () => {
    // Manual fixa team-01. Regra pede 1..2 da liga (team-01,team-02). Como
    // team-01 é âncora, a regra cai para team-02 (e team-03 se precisar).
    const liga = origemClubes(teams(3))
    const manuais: AncoraManual[] = [{ team_id: "team-01", rotulo: null }]
    const regras = [
      regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 2 }),
    ]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), manuais, semExclusoes)

    const ids = pool.entradas.map((e) => e.team_id)
    // Âncora primeiro (seed 1), depois os derivados.
    expect(ids).toEqual(["team-01", "team-02", "team-03"])
    expect(pool.entradas[0].manual).toBe(true)
    expect(pool.entradas[0].seed).toBe(1)
    expect(pool.entradas.slice(1).every((e) => !e.manual)).toBe(true)
  })

  it("âncora por rótulo normaliza e bloqueia o derivado homônimo", () => {
    const origem = origemRotulos(["Flamengo", "Vasco"])
    const manuais: AncoraManual[] = [{ team_id: null, rotulo: "  FLAMENGO " }]
    const regras = [regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 2 })]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": origem }), manuais, semExclusoes)

    const rotulos = pool.entradas.map((e) => e.rotulo)
    // Âncora "FLAMENGO" + derivado "Vasco" (o "Flamengo" da origem é bloqueado
    // pela identidade da âncora).
    expect(rotulos).toEqual(["  FLAMENGO ", "Vasco"])
    expect(pool.entradas.filter((e) => e.manual)).toHaveLength(1)
  })
})

/* -------------------------------------------------------------------------- */
/* derivarPool — exclusões                                                      */
/* -------------------------------------------------------------------------- */

describe("derivarPool — exclusões persistentes", () => {
  it("identidade excluída não é reintroduzida; a derivação cai para o próximo", () => {
    const liga = origemClubes(teams(3))
    const exclusoes = new Set<IdentidadeParticipante>([identidadeDe("team-02", null)])
    const regras = [regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 2 })]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), semManuais, exclusoes)

    // Pede 1..2: team-01 ok; team-02 excluído → cai para team-03.
    expect(pool.entradas.map((e) => e.team_id)).toEqual(["team-01", "team-03"])
    expect(pool.lacunas).toHaveLength(0)
  })

  it("exclusão que esgota a origem vira lacuna", () => {
    const liga = origemClubes(teams(2))
    const exclusoes = new Set<IdentidadeParticipante>([identidadeDe("team-02", null)])
    const regras = [regraDivisao({ id: "r1", competition: "p1", nivel: 1, inicio: 1, fim: 2 })]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), semManuais, exclusoes)

    // team-01 ok; team-02 excluído e não há rank 3 → lacuna.
    expect(pool.entradas.map((e) => e.team_id)).toEqual(["team-01"])
    expect(pool.lacunas).toHaveLength(1)
  })
})

/* -------------------------------------------------------------------------- */
/* derivarPool — determinismo                                                   */
/* -------------------------------------------------------------------------- */

describe("derivarPool — determinístico", () => {
  it("duas execuções idênticas produzem o mesmo pool", () => {
    const liga = origemClubes(teams(8))
    const copa = origemClubes(["team-08", "team-09"])
    const regras = [
      regraDivisao({ id: "rA", competition: "pA", nivel: 1, inicio: 1, fim: 4, prioridade: 0 }),
      regraCopa({ id: "rB", cupId: "cB", inicio: 1, fim: 2, prioridade: 5 }),
    ]
    const ler = lerOrigemDe({ "div:pA:1": liga, "cup:cB": copa })
    const a = derivarPool(regras, ler, semManuais, semExclusoes)
    const b = derivarPool(regras, ler, semManuais, semExclusoes)
    expect(a).toEqual(b)
  })

  it("varredura por prioridade asc depois rank asc (não pela ordem das regras)", () => {
    // Regra de prioridade ALTA declarada DEPOIS deve vencer na alocação.
    const liga = origemClubes(teams(4))
    const regras = [
      // Declarada primeiro, prioridade BAIXA (10): rank 1..1.
      regraDivisao({ id: "rBaixa", competition: "p1", nivel: 1, inicio: 1, fim: 1, prioridade: 10 }),
      // Declarada depois, prioridade ALTA (0): rank 1..1 (mesma origem!).
      regraDivisao({ id: "rAlta", competition: "p1", nivel: 1, inicio: 1, fim: 1, prioridade: 0 }),
    ]
    const pool = derivarPool(regras, lerOrigemDe({ "div:p1:1": liga }), semManuais, semExclusoes)
    // rAlta (prioridade 0) processa primeiro → pega rank 1 (team-01). rBaixa cai
    // para team-02 (cursor compartilhado da mesma origem).
    expect(pool.entradas.map((e) => e.team_id)).toEqual(["team-01", "team-02"])
    const e01 = pool.entradas.find((e) => e.team_id === "team-01")!
    expect(e01.origem_rule_id).toBe("rAlta")
  })
})
