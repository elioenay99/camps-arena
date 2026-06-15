import { describe, expect, it } from "vitest"

import { confrontosTextoDaRodada } from "@/features/match/confrontosTextoDaRodada"
import type {
  PartidaAberta,
  PartidaEncerrada,
} from "@/features/standings/data/getTournamentClassificacao"

const aberta = (over: Partial<PartidaAberta>): PartidaAberta =>
  ({
    id: "a",
    nome_1: "A",
    nome_2: "B",
    placar_1: 0,
    placar_2: 0,
    status: "agendada",
    rodada: 1,
    perna: null,
    grupo: null,
    participante_1: null,
    participante_2: null,
    ...over,
  }) as PartidaAberta

const encerrada = (over: Partial<PartidaEncerrada>): PartidaEncerrada =>
  ({
    id: "e",
    nome_1: "C",
    nome_2: "D",
    placar_1: 0,
    placar_2: 0,
    encerradaEm: "2026-05-01T00:00:00Z",
    rodada: 1,
    perna: null,
    grupo: null,
    ...over,
  }) as PartidaEncerrada

describe("confrontosTextoDaRodada", () => {
  it("filtra pela rodada e extrai comandante + celular das abertas", () => {
    const r = confrontosTextoDaRodada(
      1,
      [
        aberta({
          rodada: 1,
          nome_1: "Grêmio",
          nome_2: "Inter",
          tecnico_1: { id: "t1", nome: "Ana" },
          tecnico_2: { id: "t2", nome: "Beto" },
          participante_1: { id: "u1", celular: "11912345678" },
          participante_2: { id: "u2", celular: null },
        }),
        aberta({ rodada: 2, nome_1: "Fora", nome_2: "Rodada" }),
      ],
      []
    )
    expect(r).toHaveLength(1)
    expect(r[0].lado1).toEqual({ clube: "Grêmio", comandante: "Ana", celular: "11912345678" })
    expect(r[0].lado2).toEqual({ clube: "Inter", comandante: "Beto", celular: null })
  })

  it("deduplica a 2ª perna de ida-e-volta (perna === 2)", () => {
    const r = confrontosTextoDaRodada(
      3,
      [
        aberta({ id: "p1", rodada: 3, perna: 1, nome_1: "A", nome_2: "B" }),
        aberta({ id: "p2", rodada: 3, perna: 2, nome_1: "B", nome_2: "A" }),
      ],
      []
    )
    expect(r).toHaveLength(1)
    expect(r[0].lado1.clube).toBe("A")
  })

  it("mescla abertas + encerradas da rodada; encerrada sai sem celular", () => {
    const r = confrontosTextoDaRodada(
      1,
      [aberta({ rodada: 1, nome_1: "A", nome_2: "B" })],
      [
        encerrada({
          rodada: 1,
          nome_1: "C",
          nome_2: "D",
          tecnico_1: { id: "t", nome: "Caio" },
        }),
      ]
    )
    expect(r).toHaveLength(2)
    const enc = r[1]
    expect(enc.lado1).toEqual({ clube: "C", comandante: "Caio", celular: null })
    expect(enc.lado2.comandante).toBeNull()
  })

  it("vaga sem técnico vira comandante null (vira ❌ no texto)", () => {
    const r = confrontosTextoDaRodada(1, [aberta({ rodada: 1, tecnico_1: null })], [])
    expect(r[0].lado1.comandante).toBeNull()
  })
})
