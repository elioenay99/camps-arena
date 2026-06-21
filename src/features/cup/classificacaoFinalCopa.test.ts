import { describe, expect, it } from "vitest"

import {
  lerClassificacaoFinalCopa,
  type SlotEdicao,
} from "@/features/cup/classificacaoFinalCopa"
import { identidadeDe } from "@/features/cup/derivacao"

import type { PartidaJogada } from "@/features/knockout/gerarChaveMataMata"

/* -------------------------------------------------------------------------- */
/* Fábricas de teste                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Slots por clube: `s1`..`sN`, seed = índice+1, team_id = `team-1`..`team-N`.
 * O id opaco do slot (`s1`) é o que aparece em `match.participante_1/2`.
 */
function slots(n: number): SlotEdicao[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i + 1}`,
    seed: i + 1,
    team_id: `team-${i + 1}`,
    rotulo: null,
  }))
}

/** Partida de jogo único encerrada (sem ida-e-volta). */
function jogo(
  rodada: number,
  posicao: number,
  p1: string | null,
  p2: string | null,
  placar1: number,
  placar2: number
): PartidaJogada {
  return {
    rodada,
    posicao,
    perna: null,
    participante_1: p1,
    participante_2: p2,
    placar_1: placar1,
    placar_2: placar2,
    status: "encerrada",
  }
}

const idTeam = (n: number) => identidadeDe(`team-${n}`, null)

/** Busca a posicao_final de um clube (por team-n) no resultado. */
function posDe(
  linhas: ReturnType<typeof lerClassificacaoFinalCopa>,
  n: number
): number | undefined {
  return linhas.find((l) => l.identidade === idTeam(n))?.posicao_final
}

/* -------------------------------------------------------------------------- */
/* Chave de 4 (semis + final)                                                   */
/* -------------------------------------------------------------------------- */

describe("lerClassificacaoFinalCopa — chave de 4, SEM 3º lugar", () => {
  // Semis: s1 (seed1) vs s4 (seed4); s2 (seed2) vs s3 (seed3).
  // s1 vence s4; s2 vence s3. Final: s1 vence s2.
  // Campeão s1, vice s2; semifinalistas s4 e s3 empatam em 3.
  const partidas: PartidaJogada[] = [
    jogo(1, 1, "s1", "s4", 2, 0), // s1 avança
    jogo(1, 2, "s2", "s3", 1, 0), // s2 avança
    jogo(2, 1, "s1", "s2", 3, 1), // final: s1 campeão
  ]

  it("campeão=1, vice=2, semifinalistas empatam em 3", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(4), { terceiroLugar: false })
    expect(posDe(r, 1)).toBe(1) // s1 campeão
    expect(posDe(r, 2)).toBe(2) // s2 vice
    expect(posDe(r, 3)).toBe(3) // s3 semifinalista
    expect(posDe(r, 4)).toBe(3) // s4 semifinalista (empate em 3)
  })

  it("ordena semifinalistas empatados por seed (s3 seed3 antes de s4 seed4)", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(4), { terceiroLugar: false })
    const terceiros = r.filter((l) => l.posicao_final === 3).map((l) => l.identidade)
    // s3 tem seed 3 (menor) → vem antes de s4 (seed 4) na ordem de apresentação.
    expect(terceiros).toEqual([idTeam(3), idTeam(4)])
  })

  it("todos os 4 participantes recebem posição", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(4), { terceiroLugar: false })
    expect(r).toHaveLength(4)
  })
})

describe("lerClassificacaoFinalCopa — chave de 4, COM 3º lugar", () => {
  // Mesma chave; + disputa de 3º (rodada 2, posicao 2): perdedores das semis
  // s4 e s3 jogam; s3 vence → 3º lugar; s4 → 4º.
  const partidas: PartidaJogada[] = [
    jogo(1, 1, "s1", "s4", 2, 0),
    jogo(1, 2, "s2", "s3", 1, 0),
    jogo(2, 1, "s1", "s2", 3, 1), // final
    jogo(2, 2, "s3", "s4", 2, 1), // 3º lugar: s3 vence
  ]

  it("campeão=1, vice=2, 3º lugar=3, 4º=4 (disputa decide)", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(4), { terceiroLugar: true })
    expect(posDe(r, 1)).toBe(1)
    expect(posDe(r, 2)).toBe(2)
    expect(posDe(r, 3)).toBe(3) // venceu a disputa de 3º
    expect(posDe(r, 4)).toBe(4) // perdeu a disputa de 3º
  })

  it("não há empate em 3 quando há disputa", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(4), { terceiroLugar: true })
    const naPos3 = r.filter((l) => l.posicao_final === 3)
    expect(naPos3).toHaveLength(1)
  })
})

/* -------------------------------------------------------------------------- */
/* Chave de 8 (quartas + semis + final)                                         */
/* -------------------------------------------------------------------------- */

describe("lerClassificacaoFinalCopa — chave de 8 (quartas, semis, final)", () => {
  // Seeds 1..8 → slots s1..s8. Ordem de seed da chave de 8 nos confrontos de
  // quartas (semearPlayoffPorPosicao): [1,8],[4,5],[2,7],[3,6].
  // Cada confronto: o de MENOR seed vence. Vencedores: s1,s4,s2,s3.
  // Semis: confronto slot1 = s1 vs s4 → s1; slot2 = s2 vs s3 → s2.
  // Final: s1 vs s2 → s1 campeão. Sem 3º lugar.
  const partidas: PartidaJogada[] = [
    // Quartas (rodada 1, 4 confrontos)
    jogo(1, 1, "s1", "s8", 1, 0),
    jogo(1, 2, "s4", "s5", 1, 0),
    jogo(1, 3, "s2", "s7", 1, 0),
    jogo(1, 4, "s3", "s6", 1, 0),
    // Semis (rodada 2, 2 confrontos): pareamento fixo 2i-1 × 2i.
    jogo(2, 1, "s1", "s4", 1, 0),
    jogo(2, 2, "s2", "s3", 1, 0),
    // Final (rodada 3)
    jogo(3, 1, "s1", "s2", 1, 0),
  ]

  it("campeão=1, vice=2, semifinalistas=3, quartas-eliminados=5", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(8), { terceiroLugar: false })
    expect(posDe(r, 1)).toBe(1) // campeão
    expect(posDe(r, 2)).toBe(2) // vice
    // Semifinalistas perdedores: s4 e s3 → posição 3.
    expect(posDe(r, 4)).toBe(3)
    expect(posDe(r, 3)).toBe(3)
    // Eliminados nas quartas: s8,s5,s7,s6 → posição 5 (empate).
    for (const n of [8, 5, 7, 6]) {
      expect(posDe(r, n)).toBe(5)
    }
  })

  it("todos os 8 participantes recebem posição; eliminados de quartas empatam em 5", () => {
    const r = lerClassificacaoFinalCopa(partidas, slots(8), { terceiroLugar: false })
    expect(r).toHaveLength(8)
    expect(r.filter((l) => l.posicao_final === 5)).toHaveLength(4)
  })
})

/* -------------------------------------------------------------------------- */
/* Grupos+mata: eliminados de grupos abaixo da chave (D11)                      */
/* -------------------------------------------------------------------------- */

describe("lerClassificacaoFinalCopa — eliminados de grupos ficam abaixo da chave", () => {
  // Chave de 4 (s1..s4) + 2 eliminados de grupos (s5, s6) já ordenados pelo
  // chamador (s5 melhor que s6). Campeão s1 (1), vice s2 (2), semis em 3;
  // s5 e s6 recebem 4 e 5 (contíguos após a chave).
  const partidas: PartidaJogada[] = [
    jogo(1, 1, "s1", "s4", 2, 0),
    jogo(1, 2, "s2", "s3", 1, 0),
    jogo(2, 1, "s1", "s2", 3, 1),
  ]

  it("eliminados de grupos recebem posições contíguas após o último da chave", () => {
    const slotsComGrupos: SlotEdicao[] = [
      ...slots(4),
      { id: "s5", seed: 5, team_id: "team-5", rotulo: null },
      { id: "s6", seed: 6, team_id: "team-6", rotulo: null },
    ]
    const r = lerClassificacaoFinalCopa(partidas, slotsComGrupos, {
      terceiroLugar: false,
      eliminadosGruposOrdenados: ["s5", "s6"],
    })
    // Chave: 1,2,3,3 (maior posição da chave = 3). Eliminados de grupos: 4, 5.
    expect(posDe(r, 1)).toBe(1)
    expect(posDe(r, 2)).toBe(2)
    expect(posDe(r, 5)).toBe(4)
    expect(posDe(r, 6)).toBe(5)
  })
})

/* -------------------------------------------------------------------------- */
/* Casos defensivos                                                             */
/* -------------------------------------------------------------------------- */

describe("lerClassificacaoFinalCopa — defensivo", () => {
  it("chave de 2 (final direta): campeão=1, vice=2", () => {
    const partidas: PartidaJogada[] = [jogo(1, 1, "s1", "s2", 2, 1)]
    const r = lerClassificacaoFinalCopa(partidas, slots(2), { terceiroLugar: false })
    expect(posDe(r, 1)).toBe(1)
    expect(posDe(r, 2)).toBe(2)
    expect(r).toHaveLength(2)
  })

  it("sem partidas e sem eliminados de grupos → vazio", () => {
    const r = lerClassificacaoFinalCopa([], slots(4), { terceiroLugar: false })
    expect(r).toHaveLength(0)
  })
})
