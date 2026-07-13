import { describe, expect, it } from "vitest"

import {
  pontosDoConfronto,
  type PartidaClassificavel,
  type RegrasPontuacao,
  type LinhaClassificacao,
} from "@/features/standings/computeStandings"
import {
  calcularForma,
  calcularDestaques,
  calcularDestaquesCompetidor,
  calcularMuralha,
  confrontoDireto,
  rechavearInsights,
  ordenarPorData,
  type CompetidorMuralha,
  type PartidaCronologica,
} from "@/features/standings/insights"

const CBF: RegrasPontuacao = { vitoria: 3, empate: 1, derrota: 0 }

/** Partida cronológica: rodada e id derivados do índice quando omitidos. */
function jogo(
  p1: string | null,
  p2: string | null,
  g1: number,
  g2: number,
  extra: Partial<PartidaCronologica> = {}
): PartidaCronologica {
  return {
    participante_1: p1,
    participante_2: p2,
    placar_1: g1,
    placar_2: g2,
    status: "encerrada",
    rodada: 1,
    criadaEm: "2026-01-01T00:00:00.000Z",
    id: "m0",
    ...extra,
  }
}

/** W.O. cronológico (0x0, vencedor explícito). */
function woJogo(
  p1: string,
  p2: string,
  vencedor: string,
  extra: Partial<PartidaCronologica> = {}
): PartidaCronologica {
  return jogo(p1, p2, 0, 0, { woVencedor: vencedor, ...extra })
}

describe("pontosDoConfronto (extração do desempate)", () => {
  it("soma placar, W.O. e duplo W.O. entre os dois", () => {
    const partidas: PartidaClassificavel[] = [
      { participante_1: "A", participante_2: "B", placar_1: 2, placar_2: 0, status: "encerrada" },
      { participante_1: "B", participante_2: "A", placar_1: 1, placar_2: 1, status: "encerrada" },
      { participante_1: "A", participante_2: "B", placar_1: 0, placar_2: 0, status: "encerrada", woVencedor: "A" },
      { participante_1: "A", participante_2: "B", placar_1: 0, placar_2: 0, status: "encerrada", woDuplo: true },
    ]
    // A: vitória(3) + empate(1) + W.O. a favor(3) + duplo W.O. derrota(0) = 7
    expect(pontosDoConfronto("A", "B", partidas, CBF)).toBe(7)
    // B: derrota(0) + empate(1) + W.O. contra(0) + duplo(0) = 1
    expect(pontosDoConfronto("B", "A", partidas, CBF)).toBe(1)
  })

  it("ignora input NÃO-elegível (trava o filtro ehElegivel interno)", () => {
    const naoElegiveis: PartidaClassificavel[] = [
      { participante_1: "A", participante_2: "B", placar_1: 5, placar_2: 0, status: "agendada" },
      { participante_1: "A", participante_2: "A", placar_1: 3, placar_2: 0, status: "encerrada" },
      { participante_1: null, participante_2: "B", placar_1: 3, placar_2: 0, status: "encerrada" },
      { participante_1: "A", participante_2: "C", placar_1: 4, placar_2: 0, status: "encerrada" },
    ]
    expect(pontosDoConfronto("A", "B", naoElegiveis, CBF)).toBe(0)
  })
})

describe("calcularMuralha", () => {
  /** Mapa lado(id)→competidor a partir de { id: nome }. escudo sempre null. */
  function mapaDe(
    entradas: Record<string, string>
  ): Map<string, CompetidorMuralha> {
    return new Map(
      Object.entries(entradas).map(([id, nome]) => [
        id,
        { competitorId: id, nome, escudoUrl: null },
      ])
    )
  }

  it("0x0 REAL conta como clean sheet; W.O. e duplo W.O. NÃO contam (lado pulado)", () => {
    const mapa = mapaDe({ A: "Alfa", B: "Beta" })
    const partidas = [
      jogo("A", "B", 0, 0), // 0x0 real → clean sheet para os dois
      woJogo("A", "B", "A"), // W.O. → pula os dois lados
      jogo("A", "B", 0, 3, { woDuplo: true }), // duplo W.O. → pula (placar ignorado)
    ]
    const r = calcularMuralha(partidas, mapa)
    const a = r.find((l) => l.competitorId === "A")!
    const b = r.find((l) => l.competitorId === "B")!
    // Só o 0x0 real entra: 1 jogo, 1 clean sheet, 0 gols sofridos (o W.O. 0x3
    // não credita gols — o lado foi pulado por inteiro).
    expect(a).toMatchObject({ jogos: 1, cleanSheets: 1, golsSofridos: 0 })
    expect(b).toMatchObject({ jogos: 1, cleanSheets: 1, golsSofridos: 0 })
  })

  it("agrega por competidor unindo slots distintos do MESMO competidor", () => {
    // A1 e A2 são slots do competidor "A" (temporadas diferentes na pirâmide).
    const mapa = new Map<string, CompetidorMuralha>([
      ["A1", { competitorId: "A", nome: "Alfa", escudoUrl: null }],
      ["A2", { competitorId: "A", nome: "Alfa", escudoUrl: null }],
    ])
    const partidas = [
      jogo("A1", "x", 1, 0), // clean sheet, 0 sofridos
      jogo("A2", "x", 0, 1), // sofreu 1
    ]
    const r = calcularMuralha(partidas, mapa)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      competitorId: "A",
      jogos: 2,
      cleanSheets: 1,
      golsSofridos: 1,
    })
  })

  it("ignora jogo não encerrado (ehElegivel) e lado sem competidor", () => {
    const mapa = mapaDe({ A: "Alfa" }) // B fora do mapa (avulso)
    const partidas = [
      jogo("A", "B", 0, 0), // conta só para A (B não mapeado)
      jogo("A", "B", 5, 0, { status: "agendada" }), // não-encerrado → ignorado
    ]
    const r = calcularMuralha(partidas, mapa)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      competitorId: "A",
      jogos: 1,
      cleanSheets: 1,
      golsSofridos: 0,
    })
  })

  it("gols sofridos = placar do adversário, somados só nos jogos reais", () => {
    const mapa = mapaDe({ A: "Alfa" })
    const partidas = [
      jogo("A", "x", 2, 1), // sofreu 1
      jogo("A", "x", 0, 3), // sofreu 3
      jogo("A", "x", 0, 9, { woVencedor: "x" }), // W.O. → não soma os 9
    ]
    const r = calcularMuralha(partidas, mapa)
    expect(r[0]).toMatchObject({ jogos: 2, cleanSheets: 0, golsSofridos: 4 })
  })

  it("ordena por clean sheets desc → gols sofridos asc → jogos desc", () => {
    const mapa = mapaDe({
      O: "Muralha O",
      N: "Muralha N",
      M: "Muralha M",
      P: "Muralha P",
    })
    const partidas = [
      // O: cs2, gc1, jogos3
      jogo("O", "x", 1, 0),
      jogo("O", "x", 2, 0),
      jogo("O", "x", 0, 1),
      // N: cs2, gc2, jogos4
      jogo("N", "x", 1, 0),
      jogo("N", "x", 2, 0),
      jogo("N", "x", 0, 1),
      jogo("N", "x", 0, 1),
      // M: cs2, gc2, jogos3
      jogo("M", "x", 1, 0),
      jogo("M", "x", 2, 0),
      jogo("M", "x", 0, 2),
      // P: cs1
      jogo("P", "x", 3, 0),
    ]
    const r = calcularMuralha(partidas, mapa)
    // O (menor GC) → N (mesmo cs/gc que M, mais jogos) → M → P (menos cs).
    expect(r.map((l) => l.competitorId)).toEqual(["O", "N", "M", "P"])
  })

  it("desempata por nome quando cs/gols/jogos empatam", () => {
    const mapa = mapaDe({ z: "Zebra", a: "Aardvark" })
    const partidas = [jogo("z", "x", 1, 0), jogo("a", "y", 1, 0)]
    const r = calcularMuralha(partidas, mapa)
    expect(r.map((l) => l.competitorId)).toEqual(["a", "z"])
  })
})

describe("calcularForma", () => {
  it("ordena cronologicamente (rodada asc) e espelha V/E/D", () => {
    const partidas = [
      jogo("A", "B", 2, 0, { rodada: 1, id: "m1" }),
      jogo("B", "A", 1, 1, { rodada: 2, id: "m2" }),
      jogo("A", "C", 0, 3, { rodada: 3, id: "m3" }),
    ]
    const forma = calcularForma(partidas)
    expect(forma.get("A")!.map((i) => i.resultado)).toEqual(["V", "E", "D"])
    expect(forma.get("B")!.map((i) => i.resultado)).toEqual(["D", "E"])
  })

  it("W.O. na forma segue a creditação do motor (V/D + flag wo)", () => {
    const forma = calcularForma([woJogo("A", "B", "A", { id: "m1" })])
    expect(forma.get("A")).toEqual([{ resultado: "V", wo: true, rodada: 1 }])
    expect(forma.get("B")).toEqual([{ resultado: "D", wo: true, rodada: 1 }])
  })

  it("duplo W.O. = D para os dois", () => {
    const forma = calcularForma([jogo("A", "B", 0, 0, { woDuplo: true, id: "m1" })])
    expect(forma.get("A")![0].resultado).toBe("D")
    expect(forma.get("B")![0].resultado).toBe("D")
  })

  it("participante sem jogos não aparece; <5 jogos devolve o que há", () => {
    const forma = calcularForma([jogo("A", "B", 1, 0, { id: "m1" })])
    expect(forma.has("Z")).toBe(false)
    expect(forma.get("A")!).toHaveLength(1)
  })
})

describe("calcularDestaques", () => {
  const linhas: LinhaClassificacao[] = [
    { participanteId: "A", posicao: 1, pontos: 6, jogos: 2, vitorias: 2, empates: 0, derrotas: 0, golsPro: 7, golsContra: 1, saldo: 6 },
    { participanteId: "B", posicao: 2, pontos: 3, jogos: 2, vitorias: 1, empates: 0, derrotas: 1, golsPro: 3, golsContra: 4, saldo: -1 },
    { participanteId: "C", posicao: 3, pontos: 0, jogos: 2, vitorias: 0, empates: 0, derrotas: 2, golsPro: 1, golsContra: 6, saldo: -5 },
  ]

  it("melhor ataque = maior GP; melhor defesa = menor GC", () => {
    const d = calcularDestaques(linhas, [])
    expect(d.melhorAtaque).toEqual({ participanteId: "A", valor: 7 })
    expect(d.melhorDefesa).toEqual({ participanteId: "A", valor: 1 })
  })

  it("maior goleada ignora W.O. e desempata pela mais antiga", () => {
    const partidas = [
      jogo("A", "C", 4, 0, { rodada: 1, id: "m1" }),
      woJogo("A", "B", "A", { rodada: 2, id: "m2" }),
      jogo("A", "B", 5, 1, { rodada: 3, id: "m3" }), // dif 4, mesma do 4x0
    ]
    const d = calcularDestaques(linhas, partidas)
    expect(d.maiorGoleada?.diferenca).toBe(4)
    expect(d.maiorGoleada?.matchId).toBe("m1") // empate de dif → mais antiga
    expect(d.maiorGoleada?.placarVencedor).toBe(4)
  })

  it("média de gols exclui W.O. do numerador e denominador", () => {
    const partidas = [
      jogo("A", "B", 2, 1, { id: "m1" }), // 3 gols
      jogo("A", "C", 1, 0, { id: "m2" }), // 1 gol
      woJogo("A", "B", "A", { id: "m3" }), // W.O. — ignorado
    ]
    // (3 + 1) / 2 = 2
    expect(calcularDestaques(linhas, partidas).mediaGolsPorJogo).toBe(2)
  })

  it("sequência de vitórias interrompida por empate", () => {
    const partidas = [
      jogo("A", "B", 1, 0, { rodada: 1, id: "m1" }),
      jogo("A", "C", 1, 0, { rodada: 2, id: "m2" }),
      jogo("A", "B", 0, 0, { rodada: 3, id: "m3" }), // empate quebra
      jogo("A", "C", 1, 0, { rodada: 4, id: "m4" }),
    ]
    expect(calcularDestaques(linhas, partidas).maiorSequenciaVitorias?.extensao).toBe(2)
  })

  it("clean sheet: 0x0 REAL estende, W.O. quebra (discriminante)", () => {
    const partidas = [
      jogo("A", "B", 0, 0, { rodada: 1, id: "m1" }), // clean sheet real (ambos)
      jogo("A", "C", 2, 0, { rodada: 2, id: "m2" }), // A não sofre
      woJogo("A", "B", "A", { rodada: 3, id: "m3" }), // W.O. quebra
      jogo("A", "C", 1, 0, { rodada: 4, id: "m4" }), // A não sofre
    ]
    const d = calcularDestaques(linhas, partidas)
    // A: CS, CS, (quebra), CS → maior run = 2
    expect(d.maiorSequenciaCleanSheets?.participanteId).toBe("A")
    expect(d.maiorSequenciaCleanSheets?.extensao).toBe(2)
  })

  it("competição sem jogos: destaques neutros, média zero", () => {
    const d = calcularDestaques([], [])
    expect(d.melhorAtaque).toBeNull()
    expect(d.melhorDefesa).toBeNull()
    expect(d.maiorGoleada).toBeNull()
    expect(d.maiorInvencibilidade).toBeNull()
    expect(d.mediaGolsPorJogo).toBe(0)
  })

  it("melhor ataque null quando ninguém marcou", () => {
    const semGols: LinhaClassificacao[] = [
      { participanteId: "A", posicao: 1, pontos: 1, jogos: 1, vitorias: 0, empates: 1, derrotas: 0, golsPro: 0, golsContra: 0, saldo: 0 },
    ]
    const d = calcularDestaques(semGols, [jogo("A", "B", 0, 0, { id: "m1" })])
    expect(d.melhorAtaque).toBeNull()
    expect(d.melhorDefesa).toEqual({ participanteId: "A", valor: 0 })
  })
})

describe("calcularDestaquesCompetidor (carreira, sem ataque/defesa relativos)", () => {
  it("agrega V/E/D + gols e a maior goleada dele, ordenando por data", () => {
    const partidas = [
      jogo("A", "B", 3, 0, { criadaEm: "2026-01-01T00:00:00.000Z", id: "m1", rodada: 5 }),
      jogo("C", "A", 1, 2, { criadaEm: "2026-02-01T00:00:00.000Z", id: "m2", rodada: 1 }),
      woJogo("A", "B", "B", { criadaEm: "2026-03-01T00:00:00.000Z", id: "m3" }), // A perde por W.O.
    ]
    const d = calcularDestaquesCompetidor("A", partidas)
    expect(d.vitorias).toBe(2)
    expect(d.derrotas).toBe(1)
    expect(d.golsPro).toBe(5) // 3 + 2 (W.O. não conta gol)
    expect(d.maiorGoleada?.diferenca).toBe(3)
    expect(d.maiorGoleada?.vencedorId).toBe("A")
    expect(d.maiorInvencibilidade).toBe(2)
    expect("melhorAtaque" in d).toBe(false)
  })
})

describe("confrontoDireto", () => {
  it("agrega V/E/D por lado e gols de A", () => {
    const partidas = [
      jogo("A", "B", 2, 1, { criadaEm: "2026-01-01T00:00:00.000Z", id: "m1" }),
      jogo("B", "A", 0, 0, { criadaEm: "2026-02-01T00:00:00.000Z", id: "m2" }),
      jogo("A", "B", 3, 0, { criadaEm: "2026-03-01T00:00:00.000Z", id: "m3" }),
    ]
    const c = confrontoDireto("A", "B", partidas)
    expect(c.jogos).toHaveLength(3)
    expect(c.aVitorias).toBe(2)
    expect(c.empates).toBe(1)
    expect(c.bVitorias).toBe(0)
    expect(c.duploWo).toBe(0)
    expect(c.aGolsPro).toBe(5)
    expect(c.aGolsContra).toBe(1)
    expect(c.aDerrotas).toBe(0)
    // normaliza a perspectiva de A mesmo quando A é o lado 2
    expect(c.jogos[1]).toMatchObject({ placarA: 0, placarB: 0, resultadoA: "E" })
  })

  it("duplo W.O.: 1 jogo, 0V/0E/0B, duploWo=1, gols zerados, invariantes", () => {
    const c = confrontoDireto("A", "B", [
      jogo("A", "B", 0, 0, { woDuplo: true, id: "m1" }),
    ])
    expect(c.jogos).toHaveLength(1)
    expect(c.jogos[0].woDuplo).toBe(true)
    expect(c.aVitorias).toBe(0)
    expect(c.empates).toBe(0)
    expect(c.bVitorias).toBe(0)
    expect(c.duploWo).toBe(1)
    expect(c.aGolsPro).toBe(0)
    expect(c.aGolsContra).toBe(0)
    // invariantes
    expect(c.jogos.length).toBe(c.aVitorias + c.bVitorias + c.empates + c.duploWo)
    expect(c.aDerrotas).toBe(c.bVitorias + c.duploWo)
    expect(c.bDerrotas).toBe(c.aVitorias + c.duploWo)
  })

  it("W.O. simples respeita o vencedor sem creditar gol", () => {
    const c = confrontoDireto("A", "B", [woJogo("A", "B", "B", { id: "m1" })])
    expect(c.bVitorias).toBe(1)
    expect(c.aVitorias).toBe(0)
    expect(c.jogos[0]).toMatchObject({ resultadoA: "D", wo: true, woDuplo: false })
    expect(c.aGolsPro).toBe(0)
  })

  it("nunca se enfrentaram = vazio", () => {
    const c = confrontoDireto("A", "B", [jogo("A", "C", 2, 0, { id: "m1" })])
    expect(c.jogos).toHaveLength(0)
    expect(c.aVitorias + c.bVitorias + c.empates + c.duploWo).toBe(0)
  })

  it("usa ordenarPorData por default (cruza temporadas por created_at)", () => {
    const partidas = [
      jogo("A", "B", 1, 0, { rodada: 38, criadaEm: "2026-01-01T00:00:00.000Z", id: "m1" }),
      jogo("A", "B", 0, 2, { rodada: 1, criadaEm: "2026-06-01T00:00:00.000Z", id: "m2" }),
    ]
    const c = confrontoDireto("A", "B", partidas, ordenarPorData)
    // ordem por data: m1 (jan) antes de m2 (jun), apesar da rodada maior
    expect(c.jogos.map((j) => j.matchId)).toEqual(["m1", "m2"])
  })
})

describe("rechavearInsights", () => {
  it("remapeia chaves de forma e ids de destaques", () => {
    const partidas = [jogo("s1", "s2", 3, 0, { id: "m1" })]
    const forma = calcularForma(partidas)
    const linhas: LinhaClassificacao[] = [
      { participanteId: "s1", posicao: 1, pontos: 3, jogos: 1, vitorias: 1, empates: 0, derrotas: 0, golsPro: 3, golsContra: 0, saldo: 3 },
      { participanteId: "s2", posicao: 2, pontos: 0, jogos: 1, vitorias: 0, empates: 0, derrotas: 1, golsPro: 0, golsContra: 3, saldo: -3 },
    ]
    const ins = { formaPorParticipante: forma, destaques: calcularDestaques(linhas, partidas) }
    const mapa: Record<string, string> = { s1: "c1", s2: "c2" }
    const re = rechavearInsights(ins, (id) => mapa[id] ?? id)
    expect(re.formaPorParticipante.has("c1")).toBe(true)
    expect(re.formaPorParticipante.has("s1")).toBe(false)
    expect(re.destaques.melhorAtaque?.participanteId).toBe("c1")
    expect(re.destaques.maiorGoleada?.vencedorId).toBe("c1")
    expect(re.destaques.maiorGoleada?.perdedorId).toBe("c2")
  })
})
