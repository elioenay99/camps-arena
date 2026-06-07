import { describe, expect, it } from "vitest"

import {
  computeStandings,
  type PartidaClassificavel,
  type RegrasPontuacao,
} from "@/features/standings/computeStandings"

const CBF: RegrasPontuacao = { vitoria: 3, empate: 1, derrota: 0 }

function partida(
  participante_1: string | null,
  participante_2: string | null,
  placar_1: number,
  placar_2: number,
  status: PartidaClassificavel["status"] = "encerrada"
): PartidaClassificavel {
  return { participante_1, participante_2, placar_1, placar_2, status }
}

/** W.O. encerrado: placar 0x0 no banco, vencedor explícito (decisão 9). */
function wo(
  participante_1: string,
  participante_2: string,
  woVencedor: string
): PartidaClassificavel {
  return {
    participante_1,
    participante_2,
    placar_1: 0,
    placar_2: 0,
    status: "encerrada",
    woVencedor,
  }
}

/** Atalho: [participanteId, posicao] na ordem retornada. */
function ordem(linhas: ReturnType<typeof computeStandings>) {
  return linhas.map((l) => [l.participanteId, l.posicao])
}

describe("computeStandings — acumulação", () => {
  it("converte vitória/empate/derrota em pontos, gols e jogos", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 2, 0), // a vence
      partida("a", "c", 1, 1), // empata
    ])
    const a = r.find((l) => l.participanteId === "a")!
    expect(a).toMatchObject({
      pontos: 4,
      jogos: 2,
      vitorias: 1,
      empates: 1,
      derrotas: 0,
      golsPro: 3,
      golsContra: 1,
      saldo: 2,
    })
    const b = r.find((l) => l.participanteId === "b")!
    expect(b).toMatchObject({ pontos: 0, derrotas: 1, golsPro: 0, golsContra: 2 })
    const c = r.find((l) => l.participanteId === "c")!
    expect(c).toMatchObject({ pontos: 1, empates: 1 })
  })

  it("aplica regras customizadas, inclusive ponto por derrota", () => {
    const r = computeStandings({ vitoria: 3, empate: 2, derrota: 1 }, [
      partida("a", "b", 1, 0),
    ])
    expect(r.find((l) => l.participanteId === "a")!.pontos).toBe(3)
    expect(r.find((l) => l.participanteId === "b")!.pontos).toBe(1)
  })

  it("ignora partidas não encerradas e com participante a definir", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 9, 0, "agendada"),
      partida("a", "b", 9, 0, "em_andamento"),
      partida("a", null, 9, 0),
      partida(null, "b", 0, 9),
      partida("a", "b", 1, 0), // única elegível
    ])
    expect(r.find((l) => l.participanteId === "a")!).toMatchObject({
      pontos: 3,
      jogos: 1,
      golsPro: 1,
    })
    expect(r).toHaveLength(2)
  })

  it("lista vazia produz tabela vazia", () => {
    expect(computeStandings(CBF, [])).toEqual([])
  })

  it("participante só de partidas inelegíveis não entra na tabela", () => {
    const r = computeStandings(CBF, [
      partida("x", "y", 1, 0, "agendada"),
      partida("a", "b", 1, 0),
    ])
    expect(r.map((l) => l.participanteId).sort()).toEqual(["a", "b"])
  })
})

describe("computeStandings — cadeia de desempate", () => {
  it("vitórias desempatam ANTES do saldo (1 vitória > 3 empates)", () => {
    const r = computeStandings(CBF, [
      // a: 1 vitória + 2 derrotas = 3 pts, saldo -1
      partida("a", "c", 1, 0),
      partida("a", "d", 0, 1),
      partida("a", "d", 0, 1),
      // b: 3 empates = 3 pts, saldo 0
      partida("b", "c", 0, 0),
      partida("b", "c", 0, 0),
      partida("b", "c", 0, 0),
    ])
    const ia = r.findIndex((l) => l.participanteId === "a")
    const ib = r.findIndex((l) => l.participanteId === "b")
    expect(ia).toBeLessThan(ib) // apesar do saldo pior
  })

  it("saldo desempata pontos+vitórias iguais", () => {
    const r = computeStandings(CBF, [
      partida("a", "c", 3, 0), // saldo 3
      partida("b", "c", 1, 0), // saldo 1
    ])
    expect(r[0].participanteId).toBe("a")
    expect(r[0].posicao).toBe(1)
    expect(r[1].participanteId).toBe("b")
    expect(r[1].posicao).toBe(2)
  })

  it("gols pró desempatam saldo igual", () => {
    const r = computeStandings(CBF, [
      partida("a", "c", 2, 1), // saldo 1, gp 2
      partida("b", "d", 1, 0), // saldo 1, gp 1
    ])
    expect(r[0].participanteId).toBe("a")
  })

  it("confronto direto decide entre EXATAMENTE 2 empatados", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 2, 1), // a vence o confronto direto
      partida("a", "c", 0, 1), // equaliza: a fica 3pts 1v gp2 gc2 saldo 0
      partida("b", "d", 1, 0), // b fica 3pts 1v gp2 gc2 saldo 0
    ])
    // c: 3pts 1v saldo +1 → 1º pelos critérios objetivos.
    expect(ordem(r)).toEqual([
      ["c", 1],
      ["a", 2], // venceu o confronto direto
      ["b", 3],
      ["d", 4],
    ])
  })

  it("confronto direto soma TODOS os jogos entre os dois (com empate no meio)", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 1, 0), // a +3 no confronto
      partida("b", "a", 1, 1), // +1 para cada
      partida("b", "c", 1, 0), // equaliza objetivos de b
      partida("d", "a", 1, 0), // equaliza objetivos de a
    ])
    // a e b: 4pts, 1v, gp 2, gc 2, saldo 0 — confronto: a=4, b=1.
    const ia = r.findIndex((l) => l.participanteId === "a")
    const ib = r.findIndex((l) => l.participanteId === "b")
    expect(ia).toBeLessThan(ib)
    expect(r[ia].posicao).not.toBe(r[ib].posicao)
  })

  it("3+ empatados em ciclo PULAM o confronto direto e dividem a posição", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 1, 0),
      partida("b", "c", 1, 0),
      partida("c", "a", 1, 0), // ciclo A>B>C>A — não-determinístico por confronto
    ])
    // Todos: 3pts 1v 1d gp1 gc1 saldo 0 → empate persistente, ordem por id.
    expect(ordem(r)).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 1],
    ])
  })

  it("empate persistente entre 2 divide a posição e o seguinte pula (1º,1º,3º)", () => {
    const r = computeStandings(CBF, [
      partida("a", "c", 1, 0),
      partida("b", "d", 1, 0), // a e b nunca se enfrentaram → confronto 0=0
    ])
    expect(ordem(r)).toEqual([
      ["a", 1],
      ["b", 1],
      ["c", 3],
      ["d", 3],
    ])
  })

  it("ordem de apresentação entre empatados persistentes é determinística (por id)", () => {
    const partidas = [
      partida("zeta", "x", 1, 0),
      partida("alfa", "y", 1, 0),
    ]
    const r1 = computeStandings(CBF, partidas)
    const r2 = computeStandings(CBF, [...partidas].reverse())
    expect(r1.map((l) => l.participanteId)).toEqual(r2.map((l) => l.participanteId))
    expect(r1[0].participanteId).toBe("alfa")
  })

  it("confronto direto REORDENA contra a ordem provisória (vencedor com id maior)", () => {
    const r = computeStandings(CBF, [
      partida("aaa", "zzz", 1, 2), // zzz vence o confronto direto
      partida("aaa", "c", 1, 0), // equaliza objetivos de aaa
      partida("zzz", "d", 0, 1), // equaliza objetivos de zzz
    ])
    // aaa e zzz: 3pts 1v gp2 gc2 saldo 0 — a ordem provisória (por id) poria
    // "aaa" antes; o confronto direto INVERTE.
    const iz = r.findIndex((l) => l.participanteId === "zzz")
    const ia = r.findIndex((l) => l.participanteId === "aaa")
    expect(iz).toBeLessThan(ia)
    expect(r[iz].posicao).toBeLessThan(r[ia].posicao)
  })

  it("confronto direto empatado de verdade (1-1 em 3/1/0) divide a posição", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 1, 1), // se enfrentaram e empataram
      partida("a", "c", 1, 0),
      partida("b", "d", 1, 0),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    const b = r.find((l) => l.participanteId === "b")!
    expect(a.posicao).toBe(b.posicao)
  })

  it("regra 0/0/0 zera os pontos e a tabela inteira divide a posição 1", () => {
    const r = computeStandings({ vitoria: 0, empate: 0, derrota: 0 }, [
      partida("a", "b", 1, 1),
      partida("c", "d", 1, 1),
    ])
    // Grupo de 4 (3+): confronto direto é pulado; todos posição 1.
    expect(r).toHaveLength(4)
    expect(r.every((l) => l.posicao === 1 && l.pontos === 0)).toBe(true)
  })

  it("gols contra acumulam através de várias partidas", () => {
    const r = computeStandings(CBF, [
      partida("a", "b", 0, 1),
      partida("c", "a", 2, 0),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    expect(a.golsContra).toBe(3)
    expect(a.saldo).toBe(-3)
  })

  it("self-match (dado corrompido) é descartado — espelha a CHECK do banco", () => {
    const r = computeStandings(CBF, [
      partida("a", "a", 2, 1), // inválida: mesmo participante dos dois lados
      partida("a", "b", 1, 0),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    expect(a).toMatchObject({ jogos: 1, pontos: 3, golsPro: 1 })
  })

  it("confronto direto usa as regras DO TORNEIO (não 3/1/0 fixo)", () => {
    // Regras 1/1/1: vitória no confronto não gera vantagem (todos os
    // resultados valem 1) → o confronto direto NÃO desempata.
    const r = computeStandings({ vitoria: 1, empate: 1, derrota: 1 }, [
      partida("a", "b", 2, 1),
      partida("a", "c", 0, 1),
      partida("b", "d", 1, 0),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    const b = r.find((l) => l.participanteId === "b")!
    expect(a.posicao).toBe(b.posicao) // persistente: 1 ponto cada no confronto
  })
})

describe("computeStandings — W.O. (walkover)", () => {
  it("vitória por W.O. soma os PONTOS de vitória/derrota sem tocar gols/saldo", () => {
    const r = computeStandings(CBF, [wo("a", "b", "a")])
    const a = r.find((l) => l.participanteId === "a")!
    const b = r.find((l) => l.participanteId === "b")!
    expect(a).toMatchObject({
      pontos: 3,
      vitorias: 1,
      derrotas: 0,
      jogos: 1,
      golsPro: 0,
      golsContra: 0,
      saldo: 0,
    })
    expect(b).toMatchObject({
      pontos: 0,
      derrotas: 1,
      vitorias: 0,
      jogos: 1,
      golsPro: 0,
      golsContra: 0,
      saldo: 0,
    })
  })

  it("o vencedor do W.O. é o lado 2 quando woVencedor aponta o segundo", () => {
    const r = computeStandings(CBF, [wo("a", "b", "b")])
    expect(r.find((l) => l.participanteId === "b")!).toMatchObject({
      pontos: 3,
      vitorias: 1,
    })
    expect(r.find((l) => l.participanteId === "a")!).toMatchObject({
      derrotas: 1,
      pontos: 0,
    })
  })

  it("W.O. usa os PONTOS do torneio (regra custom 2/1/0)", () => {
    const r = computeStandings({ vitoria: 2, empate: 1, derrota: 0 }, [
      wo("a", "b", "a"),
    ])
    expect(r.find((l) => l.participanteId === "a")!.pontos).toBe(2)
  })

  it("W.O. de clube ÓRFÃO é elegível (os dois lados existem; um sem técnico)", () => {
    // No fetcher os dois lados são slots preenchidos (vaga_1/vaga_2); o órfão
    // só não tem técnico. O motor recebe os dois ids → elegível.
    const r = computeStandings(CBF, [wo("comTecnico", "orfao", "comTecnico")])
    expect(r).toHaveLength(2)
    expect(r.find((l) => l.participanteId === "comTecnico")!.pontos).toBe(3)
  })

  it("W.O. NÃO altera o saldo num torneio com jogos normais + W.O.", () => {
    // a: vence b por 3x0 (jogo normal) e vence c por W.O.
    const r = computeStandings(CBF, [
      partida("a", "b", 3, 0),
      wo("a", "c", "a"),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    // 2 vitórias = 6 pontos; gols só do jogo normal (3-0), o W.O. não soma.
    expect(a).toMatchObject({ pontos: 6, vitorias: 2, golsPro: 3, golsContra: 0, saldo: 3 })
  })

  it("confronto direto por W.O. credita vitória/derrota (não empate pelo 0x0)", () => {
    // a e b empatam tudo nos critérios objetivos, separados só pelo confronto
    // direto — que foi um W.O. a favor de a. Sem o tratamento, o 0x0 contaria
    // como empate e os dois dividiriam a posição.
    const r = computeStandings(CBF, [
      // a e b: cada um vence c uma vez por 1x0 (mesmos pontos/saldo/gols).
      partida("a", "c", 1, 0),
      partida("b", "c", 1, 0),
      // confronto direto a×b foi W.O. a favor de a.
      wo("a", "b", "a"),
    ])
    const a = r.find((l) => l.participanteId === "a")!
    const b = r.find((l) => l.participanteId === "b")!
    // a venceu o confronto direto (W.O.) → fica à frente; posições distintas.
    expect(a.posicao).toBeLessThan(b.posicao)
  })
})
