import { describe, expect, it } from "vitest"

import {
  gerarTabelaLiga,
  LIGA_MAX_PARTICIPANTES,
  previaLiga,
} from "./gerarTabelaLiga"

/** Chave canônica do confronto, independente do lado (para checar cobertura). */
function chave(a: string, b: string): string {
  return [a, b].sort().join("|")
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, "0")}`)
}

describe("gerarTabelaLiga", () => {
  it("N=2 ida simples: uma rodada com um confronto", () => {
    const rodadas = gerarTabelaLiga(["a", "b"], false)
    expect(rodadas).toEqual([{ rodada: 1, confrontos: [["a", "b"]] }])
  })

  it("N par (4): N-1 rodadas completas, todas as combinações sem repetição", () => {
    const participantes = ids(4)
    const rodadas = gerarTabelaLiga(participantes, false)

    expect(rodadas).toHaveLength(3)
    expect(rodadas.map((r) => r.rodada)).toEqual([1, 2, 3])

    const vistos = new Set<string>()
    for (const r of rodadas) {
      expect(r.confrontos).toHaveLength(2)
      // Ninguém joga duas vezes na mesma rodada.
      const naRodada = r.confrontos.flat()
      expect(new Set(naRodada).size).toBe(naRodada.length)
      for (const [a, b] of r.confrontos) {
        expect(a).not.toBe(b)
        vistos.add(chave(a, b))
      }
    }
    // C(4,2) = 6 combinações, todas distintas.
    expect(vistos.size).toBe(6)
  })

  it("N ímpar (5): N rodadas com folga única por rodada", () => {
    const participantes = ids(5)
    const rodadas = gerarTabelaLiga(participantes, false)

    expect(rodadas).toHaveLength(5)

    const vistos = new Set<string>()
    const jogosPorParticipante = new Map<string, number>()
    for (const r of rodadas) {
      // 2 confrontos por rodada → exatamente 1 participante de folga.
      expect(r.confrontos).toHaveLength(2)
      const naRodada = r.confrontos.flat()
      expect(new Set(naRodada).size).toBe(4)
      for (const [a, b] of r.confrontos) {
        vistos.add(chave(a, b))
        jogosPorParticipante.set(a, (jogosPorParticipante.get(a) ?? 0) + 1)
        jogosPorParticipante.set(b, (jogosPorParticipante.get(b) ?? 0) + 1)
      }
    }
    // C(5,2) = 10 combinações; cada um joga contra os outros 4.
    expect(vistos.size).toBe(10)
    for (const p of participantes) {
      expect(jogosPorParticipante.get(p)).toBe(4)
    }
  })

  it("ida-e-volta: segundo turno espelha com lados invertidos e rodada contínua", () => {
    const participantes = ids(4)
    const soIda = gerarTabelaLiga(participantes, false)
    const completo = gerarTabelaLiga(participantes, true)

    expect(completo).toHaveLength(6)
    // Primeiro turno idêntico à ida simples.
    expect(completo.slice(0, 3)).toEqual(soIda)
    // Returno: mesma rodada relativa, lados trocados, numeração contínua.
    for (let i = 0; i < 3; i++) {
      const idaRodada = soIda[i]
      const voltaRodada = completo[3 + i]
      expect(voltaRodada.rodada).toBe(3 + idaRodada.rodada)
      expect(voltaRodada.confrontos).toEqual(
        idaRodada.confrontos.map(([a, b]) => [b, a])
      )
    }
  })

  it("é determinístico para a mesma entrada", () => {
    const participantes = ids(7)
    expect(gerarTabelaLiga(participantes, true)).toEqual(
      gerarTabelaLiga(participantes, true)
    )
  })

  it("no limite máximo, gera a tabela completa", () => {
    const participantes = ids(LIGA_MAX_PARTICIPANTES)
    const rodadas = gerarTabelaLiga(participantes, true)
    const total = rodadas.reduce((acc, r) => acc + r.confrontos.length, 0)
    // 20 participantes em ida-e-volta: 2 * C(20,2) = 380 partidas.
    expect(total).toBe(380)
  })

  it("rejeita menos de 2 participantes", () => {
    expect(() => gerarTabelaLiga([], false)).toThrow("pelo menos 2")
    expect(() => gerarTabelaLiga(["a"], false)).toThrow("pelo menos 2")
  })

  it("rejeita acima do limite", () => {
    expect(() => gerarTabelaLiga(ids(LIGA_MAX_PARTICIPANTES + 1), false)).toThrow(
      "no máximo"
    )
  })

  it("rejeita ids duplicados", () => {
    expect(() => gerarTabelaLiga(["a", "b", "a"], false)).toThrow("duplicados")
  })
})

describe("previaLiga", () => {
  it("bate com a tabela gerada para TODO N de 2 ao limite, nos dois turnos", () => {
    for (let n = 2; n <= LIGA_MAX_PARTICIPANTES; n++) {
      for (const idaEVolta of [false, true]) {
        const participantes = ids(n)
        const rodadas = gerarTabelaLiga(participantes, idaEVolta)
        const previa = previaLiga(n, idaEVolta)
        expect(previa.rodadas).toBe(rodadas.length)
        expect(previa.partidas).toBe(
          rodadas.reduce((acc, r) => acc + r.confrontos.length, 0)
        )
        // Completude round-robin: cada par exatamente `turnos` vezes…
        const porPar = new Map<string, number>()
        for (const r of rodadas) {
          // …e ninguém joga duas vezes na mesma rodada.
          const naRodada = r.confrontos.flat()
          expect(new Set(naRodada).size).toBe(naRodada.length)
          for (const [a, b] of r.confrontos) {
            const k = chave(a, b)
            porPar.set(k, (porPar.get(k) ?? 0) + 1)
          }
        }
        const turnos = idaEVolta ? 2 : 1
        expect(porPar.size).toBe((n * (n - 1)) / 2)
        for (const vezes of porPar.values()) expect(vezes).toBe(turnos)
      }
    }
  })

  it("abaixo de 2 participantes zera a prévia", () => {
    expect(previaLiga(0, false)).toEqual({ partidas: 0, rodadas: 0 })
    expect(previaLiga(1, true)).toEqual({ partidas: 0, rodadas: 0 })
  })
})
