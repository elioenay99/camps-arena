import { describe, expect, it } from "vitest"

import {
  agregarCampanhaTecnico,
  partidaNaJanela,
  type PartidaCreditada,
} from "./coachStats"

describe("partidaNaJanela (predicado meio-aberto)", () => {
  it("tenure totalmente aberta credita qualquer rodada", () => {
    expect(partidaNaJanela(1, null, null)).toBe(true)
    expect(partidaNaJanela(38, null, null)).toBe(true)
  })

  it("fronteira da troca vai para QUEM ASSUMIU (>= ini, < fim)", () => {
    // Anterior: tenure fechada rodada_fim = 6 → joga 1..5 (rodada 6 fora)
    expect(partidaNaJanela(5, null, 6)).toBe(true)
    expect(partidaNaJanela(6, null, 6)).toBe(false)
    // Quem assumiu: rodada_inicio = 6 → joga 6..10 (rodada 6 dentro)
    expect(partidaNaJanela(6, 6, null)).toBe(true)
    expect(partidaNaJanela(10, 6, null)).toBe(true)
    expect(partidaNaJanela(5, 6, null)).toBe(false)
  })

  it("janela limitada dos dois lados", () => {
    expect(partidaNaJanela(3, 2, 5)).toBe(true) // 2 <= 3 < 5
    expect(partidaNaJanela(2, 2, 5)).toBe(true)
    expect(partidaNaJanela(5, 2, 5)).toBe(false) // topo exclusivo
    expect(partidaNaJanela(1, 2, 5)).toBe(false)
  })

  it("rodada NULL só passa em tenure TOTALMENTE aberta", () => {
    expect(partidaNaJanela(null, null, null)).toBe(true)
    expect(partidaNaJanela(null, 1, null)).toBe(false)
    expect(partidaNaJanela(null, null, 5)).toBe(false)
    expect(partidaNaJanela(null, 1, 5)).toBe(false)
  })
})

function jogo(
  competitorId: string,
  lado: 1 | 2,
  placar_1: number,
  placar_2: number,
  extra: Partial<PartidaCreditada> = {}
): PartidaCreditada {
  return {
    competitorId,
    lado,
    placar_1,
    placar_2,
    woVencedorLado: null,
    woDuplo: false,
    ...extra,
  }
}

describe("agregarCampanhaTecnico", () => {
  it("agrega V/E/D, gols e saldo por lado", () => {
    const { total } = agregarCampanhaTecnico([
      jogo("cA", 1, 2, 1), // vitória, GP2 GC1
      jogo("cA", 2, 0, 0), // empate, GP0 GC0
      jogo("cA", 2, 3, 1), // lado 2 perde 1x3, derrota, GP1 GC3
    ])
    expect(total.jogos).toBe(3)
    expect(total.vitorias).toBe(1)
    expect(total.empates).toBe(1)
    expect(total.derrotas).toBe(1)
    expect(total.golsPro).toBe(3)
    expect(total.golsContra).toBe(4)
    expect(total.saldo).toBe(-1)
  })

  it("aproveitamento 3-1-0 (round) e 0 quando sem jogos", () => {
    // 1V 1E 1D em 3 jogos → (3+1)/(9) = 44.4% → 44
    const { total } = agregarCampanhaTecnico([
      jogo("cA", 1, 1, 0),
      jogo("cA", 1, 0, 0),
      jogo("cA", 1, 0, 1),
    ])
    expect(total.aproveitamento).toBe(44)
    expect(agregarCampanhaTecnico([]).total.aproveitamento).toBe(0)
    expect(agregarCampanhaTecnico([]).total.jogos).toBe(0)
  })

  it("W.O. simples: vitória/derrota com 0 gols (ignora placar)", () => {
    // placar de banco 0x0, mas woVencedorLado indica o vencedor
    const venc = agregarCampanhaTecnico([
      jogo("cA", 1, 0, 0, { woVencedorLado: 1 }),
    ]).total
    expect(venc).toMatchObject({ vitorias: 1, derrotas: 0, golsPro: 0, golsContra: 0 })
    const perd = agregarCampanhaTecnico([
      jogo("cA", 2, 0, 0, { woVencedorLado: 1 }),
    ]).total
    expect(perd).toMatchObject({ vitorias: 0, derrotas: 1, golsPro: 0, golsContra: 0 })
  })

  it("duplo W.O.: derrota com 0 gols para o lado do técnico", () => {
    const d = agregarCampanhaTecnico([
      jogo("cA", 1, 0, 0, { woDuplo: true }),
      jogo("cB", 2, 0, 0, { woDuplo: true }),
    ]).total
    expect(d).toMatchObject({ jogos: 2, vitorias: 0, empates: 0, derrotas: 2, golsPro: 0, golsContra: 0 })
  })

  it("gol contra já embutido no placar é contado (não lê match_goals)", () => {
    // vitória 1x0 onde o gol foi contra do adversário: entra em golsPro normalmente
    const { total } = agregarCampanhaTecnico([jogo("cA", 1, 1, 0)])
    expect(total.golsPro).toBe(1)
    expect(total.golsContra).toBe(0)
  })

  it("duas temporadas do mesmo clube somam na MESMA fatia; soma das fatias == total", () => {
    const { total, porClube } = agregarCampanhaTecnico([
      jogo("cA", 1, 2, 0), // temporada 1
      jogo("cA", 2, 1, 1), // temporada 2 (mesmo competidor)
      jogo("cB", 1, 0, 3), // outro clube
    ])
    expect(porClube.size).toBe(2)
    const cA = porClube.get("cA")!
    expect(cA.jogos).toBe(2)
    expect(cA.vitorias).toBe(1)
    expect(cA.empates).toBe(1)
    expect(cA.golsPro).toBe(3)
    expect(cA.golsContra).toBe(1)

    // Invariante soma das fatias == total.
    const somaJogos = [...porClube.values()].reduce((s, c) => s + c.jogos, 0)
    const somaGP = [...porClube.values()].reduce((s, c) => s + c.golsPro, 0)
    const somaGC = [...porClube.values()].reduce((s, c) => s + c.golsContra, 0)
    expect(somaJogos).toBe(total.jogos)
    expect(somaGP).toBe(total.golsPro)
    expect(somaGC).toBe(total.golsContra)
  })
})
