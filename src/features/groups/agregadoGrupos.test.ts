import { describe, expect, it } from "vitest"

import { rankearAgregadoGrupos, type LinhaAgregavel } from "./agregadoGrupos"

const l = (
  participanteId: string,
  posicao: number,
  pontos: number,
  saldo: number,
  golsPro: number
): LinhaAgregavel => ({ participanteId, posicao, pontos, saldo, golsPro })

describe("rankearAgregadoGrupos (Fase 5.2)", () => {
  it("todos os 1ºs de grupo acima de todos os 2ºs (melhores segundos)", () => {
    // Grupo A: a1(1º), a2(2º). Grupo B: b1(1º), b2(2º).
    const r = rankearAgregadoGrupos([
      [l("a1", 1, 9, 5, 8), l("a2", 2, 3, 0, 4)],
      [l("b1", 1, 7, 3, 6), l("b2", 2, 6, 1, 5)],
    ])
    const ordem = r.map((x) => x.participanteId)
    // 1ºs (a1, b1) antes dos 2ºs (b2, a2). Entre os 1ºs: a1 (9pts) > b1 (7pts).
    // Entre os 2ºs: b2 (6pts) > a2 (3pts).
    expect(ordem).toEqual(["a1", "b1", "b2", "a2"])
    expect(r.map((x) => x.posicao)).toEqual([1, 2, 3, 4])
  })

  it("um 2º de grupo com MAIS pontos fica ABAIXO de um 1º com menos (posição-no-grupo manda)", () => {
    const r = rankearAgregadoGrupos([
      [l("forte1", 1, 4, 1, 3), l("forte2", 2, 12, 9, 14)], // 2º tem 12 pts
      [l("fraco1", 1, 5, 2, 4)],
    ])
    const ordem = r.map((x) => x.participanteId)
    // forte2 (2º, 12 pts) fica ABAIXO dos dois 1ºs: ganhar o grupo vale mais que
    // somar pontos. Entre os 1ºs, fraco1 (5 pts) > forte1 (4 pts).
    expect(ordem).toEqual(["fraco1", "forte1", "forte2"])
    expect(ordem[2]).toBe("forte2") // o 2º colocado, mesmo com 12 pts, é o último
  })

  it("ordem total única (sem empate de posição) mesmo com tudo igual — desempate por id", () => {
    const r = rankearAgregadoGrupos([
      [l("zzz", 1, 6, 2, 5)],
      [l("aaa", 1, 6, 2, 5)],
    ])
    // Mesma posição-no-grupo + pontos/saldo/gols iguais ⇒ id decide (aaa < zzz).
    expect(r.map((x) => x.participanteId)).toEqual(["aaa", "zzz"])
    expect(r.map((x) => x.posicao)).toEqual([1, 2]) // posições ÚNICAS, sem divisão
  })

  it("desempate dentro do nível: pontos → saldo → gols pró", () => {
    const r = rankearAgregadoGrupos([
      [l("p", 1, 6, 2, 7)], // mesmos pontos que q
      [l("q", 1, 6, 2, 9)], // mais gols pró
      [l("s", 1, 6, 5, 4)], // mais saldo
    ])
    // todos 1º, 6 pts: saldo decide (s=5 > os outros=2); entre p,q gols pró (q=9>p=7).
    expect(r.map((x) => x.participanteId)).toEqual(["s", "q", "p"])
  })

  it("preserva os campos da linha (pontos/jogos) e só reescreve a posição", () => {
    type Linha = LinhaAgregavel & { jogos: number }
    const r = rankearAgregadoGrupos<Linha>([
      [{ participanteId: "a", posicao: 1, pontos: 9, saldo: 5, golsPro: 8, jogos: 6 }],
      [{ participanteId: "b", posicao: 2, pontos: 1, saldo: -4, golsPro: 2, jogos: 6 }],
    ])
    expect(r[0]).toMatchObject({ participanteId: "a", posicao: 1, pontos: 9, jogos: 6 })
    expect(r[1]).toMatchObject({ participanteId: "b", posicao: 2, pontos: 1, jogos: 6 })
  })
})
