import { describe, expect, it } from "vitest"

import { calcularStreakWo, LIMITE_WO_SEGUIDOS, type EventoWo } from "./woStreak"

/** Açúcar para montar eventos legíveis nos casos. */
function loss(rodada: number, perdoado = false): EventoWo {
  return { rodada, tipo: "wo_loss", perdoado }
}
function jogou(rodada: number): EventoWo {
  return { rodada, tipo: "jogou", perdoado: false }
}
function win(rodada: number): EventoWo {
  return { rodada, tipo: "wo_win", perdoado: false }
}

describe("calcularStreakWo", () => {
  it("lista vazia → streak 0", () => {
    expect(calcularStreakWo([])).toBe(0)
  })

  it("LIMITE_WO_SEGUIDOS é 3", () => {
    expect(LIMITE_WO_SEGUIDOS).toBe(3)
  })

  it("W.O.-derrota consecutivos somam", () => {
    expect(calcularStreakWo([loss(1)])).toBe(1)
    expect(calcularStreakWo([loss(1), loss(2)])).toBe(2)
    expect(calcularStreakWo([loss(1), loss(2), loss(3)])).toBe(3)
    expect(calcularStreakWo([loss(1), loss(2), loss(3), loss(4)])).toBe(4)
    expect(calcularStreakWo([loss(1), loss(2), loss(3), loss(4), loss(5)])).toBe(5)
  })

  it("streak 1 e o técnico joga → zera (auto-perdão)", () => {
    expect(calcularStreakWo([loss(1), jogou(2)])).toBe(0)
  })

  it("streak 2 e o técnico joga → zera (auto-perdão)", () => {
    expect(calcularStreakWo([loss(1), loss(2), jogou(3)])).toBe(0)
  })

  it("streak 3 e o técnico joga → NÃO zera (trava)", () => {
    expect(calcularStreakWo([loss(1), loss(2), loss(3), jogou(4)])).toBe(3)
  })

  it("streak 4 e o técnico joga → NÃO zera (trava), continua contando", () => {
    const eventos = [loss(1), loss(2), loss(3), loss(4), jogou(5)]
    expect(calcularStreakWo(eventos)).toBe(4)
    // e um novo W.O. depois da trava soma sobre o valor travado
    expect(calcularStreakWo([...eventos, loss(6)])).toBe(5)
  })

  it("W.O.-vitória no meio com streak < 3 → PRESENTE, zera", () => {
    expect(calcularStreakWo([loss(1), win(2)])).toBe(0)
    expect(calcularStreakWo([loss(1), loss(2), win(3)])).toBe(0)
  })

  it("W.O.-vitória com streak >= 3 → NÃO zera (trava)", () => {
    expect(calcularStreakWo([loss(1), loss(2), loss(3), win(4)])).toBe(3)
  })

  it("duplo W.O. (dois wo_loss) soma como qualquer W.O.-derrota", () => {
    // duplo W.O. chega como wo_loss; dois seguidos = streak 2
    expect(calcularStreakWo([loss(1), loss(2)])).toBe(2)
  })

  it("W.O.-derrota perdoado zera no ponto", () => {
    expect(calcularStreakWo([loss(1), loss(2, true)])).toBe(0)
    // perdoado zera mesmo acima do limite (o baseline limpa a conta)
    expect(calcularStreakWo([loss(1), loss(2), loss(3), loss(4, true)])).toBe(0)
  })

  it("perdão no meio zera e a contagem recomeça depois", () => {
    // loss, loss(perdoado→0), loss, loss → 2
    expect(calcularStreakWo([loss(1), loss(2, true), loss(3), loss(4)])).toBe(2)
  })

  it("sequência mista: sobe, joga (zera), sobe de novo", () => {
    const eventos = [loss(1), loss(2), jogou(3), loss(4), loss(5), loss(6)]
    // 1,2 → jogou zera → 4,5,6 somam a partir do 0 → 3
    expect(calcularStreakWo(eventos)).toBe(3)
  })

  it("trava persiste: após 3, jogar não zera e novos W.O. seguem somando", () => {
    const eventos = [
      loss(1),
      loss(2),
      loss(3), // trava em 3
      jogou(4), // não zera
      loss(5), // 4
      jogou(6), // não zera (>=3)
      loss(7), // 5
    ]
    expect(calcularStreakWo(eventos)).toBe(5)
  })

  it("presente logo no começo (streak 0) mantém 0", () => {
    expect(calcularStreakWo([jogou(1), win(2), jogou(3)])).toBe(0)
  })

  it("streak exatamente no limite (3) trava; abaixo (2) auto-perdoa", () => {
    // exatamente 3 antes de presente → trava (não zera)
    expect(calcularStreakWo([loss(1), loss(2), loss(3), jogou(4)])).toBe(3)
    // exatamente 2 antes de presente → zera
    expect(calcularStreakWo([loss(1), loss(2), jogou(3)])).toBe(0)
  })
})
