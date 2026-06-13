import { describe, expect, it } from "vitest"

import {
  decidirConfronto,
  ehTerceiroLugar,
  embaralhar,
  gerarFaseInicial,
  gerarProximaFase,
  MATA_MATA_MAX_PARTICIPANTES,
  montarConfrontosManual,
  montarConfrontosPotes,
  montarConfrontosSorteio,
  ordemDeSeed,
  POSICAO_TERCEIRO_LUGAR,
  previaMataMata,
  resultadoDaChave,
  rodadaBaseDaChave,
  rotuloFase,
  semearPlayoffPorPosicao,
  tamanhoChave,
  tamanhoChaveDasPartidas,
  totalFases,
  type PartidaChave,
  type PartidaJogada,
  type RandInt,
} from "@/features/knockout/gerarChaveMataMata"

/** Sem troca no Fisher-Yates (j = i): preserva a ordem de entrada. */
const identidade: RandInt = (n) => n - 1

/** Sempre 0: permutação determinística NÃO-trivial (rotaciona). */
const sempreZero: RandInt = () => 0

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, "0")}`)

describe("tamanhoChave / totalFases", () => {
  it("menor potência de 2 >= n", () => {
    expect(tamanhoChave(2)).toBe(2)
    expect(tamanhoChave(3)).toBe(4)
    expect(tamanhoChave(4)).toBe(4)
    expect(tamanhoChave(5)).toBe(8)
    expect(tamanhoChave(9)).toBe(16)
    expect(tamanhoChave(17)).toBe(32)
    expect(tamanhoChave(32)).toBe(32)
  })

  it("fases = log2 do tamanho", () => {
    expect(totalFases(2)).toBe(1)
    expect(totalFases(4)).toBe(2)
    expect(totalFases(8)).toBe(3)
    expect(totalFases(16)).toBe(4)
    expect(totalFases(32)).toBe(5)
  })
})

describe("embaralhar", () => {
  it("identidade preserva a ordem; não muta a entrada", () => {
    const entrada = ids(5)
    const copia = [...entrada]
    expect(embaralhar(entrada, identidade)).toEqual(copia)
    expect(entrada).toEqual(copia)
  })

  it("qualquer gerador produz uma permutação (mesmo multiset)", () => {
    const entrada = ids(8)
    const saida = embaralhar(entrada, sempreZero)
    expect([...saida].sort()).toEqual([...entrada].sort())
    expect(saida).not.toEqual(entrada) // sempreZero rotaciona — muda a ordem
  })
})

describe("montarConfrontosSorteio", () => {
  it("N potência de 2: chave completa, sem bye", () => {
    const confrontos = montarConfrontosSorteio(ids(4), identidade)
    expect(confrontos).toEqual([
      { posicao: 1, participante_1: "p01", participante_2: "p02" },
      { posicao: 2, participante_1: "p03", participante_2: "p04" },
    ])
  })

  it("N=3: chave de 4 com 1 bye, ninguém repetido", () => {
    const confrontos = montarConfrontosSorteio(ids(3), identidade)
    expect(confrontos).toHaveLength(2)
    const byes = confrontos.filter((c) => c.participante_2 === null)
    expect(byes).toHaveLength(1)
    const usados = confrontos.flatMap((c) =>
      [c.participante_1, c.participante_2].filter((p) => p !== null)
    )
    expect([...usados].sort()).toEqual(ids(3))
  })

  it("N=6: chave de 8 com 2 byes ESPAÇADOS (no máximo 1 por confronto)", () => {
    const confrontos = montarConfrontosSorteio(ids(6), identidade)
    expect(confrontos).toHaveLength(4)
    const slotsComBye = confrontos
      .filter((c) => c.participante_2 === null)
      .map((c) => c.posicao)
    expect(slotsComBye).toEqual([1, 3]) // espaçamento uniforme, não adjacentes
    for (const c of confrontos) {
      expect(c.participante_1).not.toBeNull() // nunca confronto vazio
    }
  })

  it("é determinístico dado o gerador", () => {
    const a = montarConfrontosSorteio(ids(7), sempreZero)
    const b = montarConfrontosSorteio(ids(7), sempreZero)
    expect(a).toEqual(b)
  })

  it("rejeita menos de 2, acima do limite e duplicados", () => {
    expect(() => montarConfrontosSorteio(ids(1), identidade)).toThrow(/pelo menos 2/)
    expect(() =>
      montarConfrontosSorteio(ids(MATA_MATA_MAX_PARTICIPANTES + 1), identidade)
    ).toThrow(/no máximo/)
    expect(() =>
      montarConfrontosSorteio(["a", "a"], identidade)
    ).toThrow(/duplicados/i)
  })
})

describe("montarConfrontosPotes", () => {
  it("todo confronto cruza exatamente uma cabeça com um não-cabeça", () => {
    const cabecas = ids(8).slice(0, 4)
    const demais = ids(8).slice(4)
    const confrontos = montarConfrontosPotes(cabecas, demais, sempreZero)
    expect(confrontos).toHaveLength(4)
    for (const c of confrontos) {
      expect(cabecas).toContain(c.participante_1)
      expect(demais).toContain(c.participante_2)
    }
    const usados = confrontos.flatMap((c) => [c.participante_1, c.participante_2])
    expect([...usados].sort()).toEqual(ids(8))
  })

  it("rejeita total fora de 4/8/16/32 (sem byes em potes)", () => {
    expect(() =>
      montarConfrontosPotes(ids(6).slice(0, 3), ids(6).slice(3), identidade)
    ).toThrow(/4, 8, 16, 32/)
    expect(() => montarConfrontosPotes(["a"], ["b"], identidade)).toThrow(
      /4, 8, 16, 32/
    )
  })

  it("rejeita potes de tamanhos diferentes", () => {
    expect(() =>
      montarConfrontosPotes(ids(8).slice(0, 3), ids(8).slice(3), identidade)
    ).toThrow(/metade/)
  })
})

describe("montarConfrontosManual", () => {
  it("aceita a partição exata e normaliza o bye para o lado 1", () => {
    const participantes = ids(3)
    const confrontos = montarConfrontosManual(
      [
        ["p03", "p01"],
        [null, "p02"], // bye informado no lado 2 → normalizado
      ],
      participantes
    )
    expect(confrontos).toEqual([
      { posicao: 1, participante_1: "p03", participante_2: "p01" },
      { posicao: 2, participante_1: "p02", participante_2: null },
    ])
  })

  it("rejeita nº de confrontos errado", () => {
    expect(() => montarConfrontosManual([["p01", "p02"]], ids(3))).toThrow(
      /2 confrontos/
    )
  })

  it("rejeita participante repetido", () => {
    expect(() =>
      montarConfrontosManual(
        [
          ["p01", "p02"],
          ["p01", null],
        ],
        ids(3)
      )
    ).toThrow(/único confronto/)
  })

  it("rejeita participante faltando ou estranho à lista", () => {
    // Faltando: o par vazio deixa p03 de fora → partição incompleta.
    expect(() =>
      montarConfrontosManual(
        [
          ["p01", "p02"],
          [null, null],
        ],
        ids(3)
      )
    ).toThrow(/somente eles/)
    expect(() =>
      montarConfrontosManual(
        [
          ["p01", "p02"],
          ["intruso", null],
        ],
        ids(3)
      )
    ).toThrow(/somente eles/)
  })

  it("rejeita confronto vazio mesmo com partição completa", () => {
    // N=5 (chave de 8): todos os 5 distribuídos, mas o 4º par ficou vazio.
    expect(() =>
      montarConfrontosManual(
        [
          ["p01", "p02"],
          ["p03", "p04"],
          ["p05", null],
          [null, null],
        ],
        ids(5)
      )
    ).toThrow(/vazio/)
  })
})

describe("gerarFaseInicial", () => {
  it("jogo único: uma partida por confronto real, perna nula", () => {
    const partidas = gerarFaseInicial(
      montarConfrontosSorteio(ids(4), identidade),
      false
    )
    expect(partidas).toHaveLength(2)
    expect(partidas.every((p) => p.perna === null && p.rodada === 1)).toBe(true)
  })

  it("ida-e-volta: duas pernas com lados invertidos na mesma posição", () => {
    const partidas = gerarFaseInicial(
      montarConfrontosSorteio(ids(4), identidade),
      true
    )
    expect(partidas).toHaveLength(4)
    const slot1 = partidas.filter((p) => p.posicao === 1)
    expect(slot1[0]).toMatchObject({ perna: 1, participante_1: "p01", participante_2: "p02" })
    expect(slot1[1]).toMatchObject({ perna: 2, participante_1: "p02", participante_2: "p01" })
  })

  it("N=2 com ida-e-volta: a 1ª fase JÁ é a final — jogo único", () => {
    const partidas = gerarFaseInicial(
      montarConfrontosSorteio(ids(2), identidade),
      true
    )
    expect(partidas).toHaveLength(1)
    expect(partidas[0].perna).toBeNull()
  })

  it("bye vira partida única marcada, mesmo em ida-e-volta", () => {
    const partidas = gerarFaseInicial(
      montarConfrontosSorteio(ids(3), identidade),
      true
    )
    const byes = partidas.filter((p) => p.bye)
    expect(byes).toHaveLength(1)
    expect(byes[0]).toMatchObject({ perna: null, participante_2: null })
  })
})

function jogada(parcial: Partial<PartidaJogada>): PartidaJogada {
  return {
    rodada: 1,
    posicao: 1,
    perna: null,
    participante_1: "a",
    participante_2: "b",
    placar_1: 0,
    placar_2: 0,
    status: "encerrada",
    ...parcial,
  }
}

describe("decidirConfronto", () => {
  it("jogo único: placar decide", () => {
    expect(decidirConfronto([jogada({ placar_1: 2, placar_2: 1 })])).toEqual({
      vencedor: "a",
      perdedor: "b",
    })
    expect(decidirConfronto([jogada({ placar_1: 0, placar_2: 3 })])).toEqual({
      vencedor: "b",
      perdedor: "a",
    })
  })

  it("empate ou partida aberta: indecidido (null)", () => {
    expect(decidirConfronto([jogada({ placar_1: 1, placar_2: 1 })])).toBeNull()
    expect(decidirConfronto([jogada({ status: "em_andamento", placar_1: 2 })])).toBeNull()
  })

  it("bye: lado 1 avança sem perdedor", () => {
    expect(decidirConfronto([jogada({ participante_2: null })])).toEqual({
      vencedor: "a",
      perdedor: null,
    })
  })

  it("ida-e-volta: agregado com lados invertidos decide", () => {
    const ida = jogada({ perna: 1, placar_1: 2, placar_2: 0 }) // a 2x0 b
    const voltaB = jogada({
      perna: 2,
      participante_1: "b",
      participante_2: "a",
      placar_1: 3,
      placar_2: 0,
    }) // b 3x0 a → agregado a=2, b=3
    expect(decidirConfronto([ida, voltaB])).toEqual({ vencedor: "b", perdedor: "a" })
  })

  it("ida-e-volta: agregado empatado, perna faltando ou aberta → null", () => {
    const ida = jogada({ perna: 1, placar_1: 1, placar_2: 0 })
    const voltaEmpate = jogada({
      perna: 2,
      participante_1: "b",
      participante_2: "a",
      placar_1: 1,
      placar_2: 0,
    }) // agregado 1x1
    expect(decidirConfronto([ida, voltaEmpate])).toBeNull()
    expect(decidirConfronto([ida, jogada({ perna: 2, participante_1: "b", participante_2: "a", status: "agendada" })])).toBeNull()
    expect(decidirConfronto([ida, ida])).toBeNull() // sem perna 2
  })

  it("perna avulsa no lote (a outra sumiu) NUNCA decide sozinha — defensivo", () => {
    // Um confronto de ida-e-volta só é decidível pelo agregado; uma perna
    // isolada com vencedor não pode ser confundida com jogo único.
    expect(decidirConfronto([jogada({ perna: 1, placar_1: 2, placar_2: 0 })])).toBeNull()
    expect(decidirConfronto([jogada({ perna: 2, placar_1: 2, placar_2: 0 })])).toBeNull()
  })

  describe("W.O. decide o confronto", () => {
    it("jogo único: W.O. 0x0 decide pelo woVencedor (não vira empate/null)", () => {
      expect(
        decidirConfronto([jogada({ placar_1: 0, placar_2: 0, woVencedor: "a" })])
      ).toEqual({ vencedor: "a", perdedor: "b" })
      expect(
        decidirConfronto([jogada({ placar_1: 0, placar_2: 0, woVencedor: "b" })])
      ).toEqual({ vencedor: "b", perdedor: "a" })
    })

    it("ida-e-volta: W.O. na IDA decide o confronto inteiro (volta nem precisa)", () => {
      const idaWO = jogada({ perna: 1, placar_1: 0, placar_2: 0, woVencedor: "a" })
      const voltaAberta = jogada({
        perna: 2,
        participante_1: "b",
        participante_2: "a",
        status: "agendada",
      })
      expect(decidirConfronto([idaWO, voltaAberta])).toEqual({
        vencedor: "a",
        perdedor: "b",
      })
      // Mesmo com a volta sozinha no lote.
      expect(decidirConfronto([idaWO])).toEqual({ vencedor: "a", perdedor: "b" })
    })

    it("ida-e-volta: W.O. na VOLTA também decide o confronto inteiro", () => {
      const ida = jogada({ perna: 1, placar_1: 1, placar_2: 1 })
      const voltaWO = jogada({
        perna: 2,
        participante_1: "b",
        participante_2: "a",
        placar_1: 0,
        placar_2: 0,
        woVencedor: "b",
      })
      expect(decidirConfronto([ida, voltaWO])).toEqual({
        vencedor: "b",
        perdedor: "a",
      })
    })

    it("W.O. não-encerrado é ignorado (precisa estar encerrada)", () => {
      expect(
        decidirConfronto([
          jogada({ status: "agendada", woVencedor: "a" }),
        ])
      ).toBeNull()
    })
  })
})

/** Encerra as partidas de uma fase gerada: lado 1 vence (volta 0x0). */
function encerrarFase(novas: PartidaChave[]): PartidaJogada[] {
  return novas.map((p) => ({
    rodada: p.rodada,
    posicao: p.posicao,
    perna: p.perna,
    participante_1: p.participante_1,
    participante_2: p.participante_2,
    // Perna 2 fica 0x0 (empate permitido na volta): agregado = placar da ida.
    placar_1: p.bye || p.perna === 2 ? 0 : 1,
    placar_2: 0,
    status: "encerrada",
  }))
}

describe("gerarProximaFase", () => {
  it("pareia vencedores por slot: 2i-1 × 2i → slot i", () => {
    const r1 = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(8), identidade), false)
    )
    const r2 = gerarProximaFase(r1, { idaEVolta: false, terceiroLugar: false })
    expect(r2).toHaveLength(2)
    // lado 1 venceu tudo: vencedores p01, p03, p05, p07
    expect(r2[0]).toMatchObject({
      rodada: 2,
      posicao: 1,
      participante_1: "p01",
      participante_2: "p03",
    })
    expect(r2[1]).toMatchObject({
      rodada: 2,
      posicao: 2,
      participante_1: "p05",
      participante_2: "p07",
    })
  })

  it("bye avança o lado 1 sem jogo", () => {
    const r1 = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(3), identidade), false)
    )
    // slot 1 = bye(p01); slot 2 = p02 x p03 (p02 vence)
    const r2 = gerarProximaFase(r1, { idaEVolta: false, terceiroLugar: false })
    expect(r2).toHaveLength(1)
    expect(r2[0]).toMatchObject({ participante_1: "p01", participante_2: "p02" })
  })

  it("fase incompleta lança erro descritivo", () => {
    const r1 = gerarFaseInicial(montarConfrontosSorteio(ids(4), identidade), false)
    const partidas: PartidaJogada[] = r1.map((p, i) => ({
      ...p,
      placar_1: 1,
      placar_2: 0,
      status: i === 0 ? "encerrada" : "em_andamento",
    }))
    expect(() =>
      gerarProximaFase(partidas, { idaEVolta: false, terceiroLugar: false })
    ).toThrow(/sem vencedor/)
  })

  it("semifinal → final + 3º lugar com os perdedores (jogo único)", () => {
    const semis = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(4), identidade), true)
    )
    const finalETerceiro = gerarProximaFase(semis, {
      idaEVolta: true,
      terceiroLugar: true,
    })
    expect(finalETerceiro).toHaveLength(2)
    expect(finalETerceiro[0]).toMatchObject({
      rodada: 2,
      posicao: 1,
      perna: null, // final é jogo único mesmo em ida-e-volta
      participante_1: "p01",
      participante_2: "p03",
    })
    expect(finalETerceiro[1]).toMatchObject({
      rodada: 2,
      posicao: POSICAO_TERCEIRO_LUGAR,
      perna: null,
      participante_1: "p02",
      participante_2: "p04",
    })
  })

  it("semifinal com bye (N=3) não gera 3º lugar", () => {
    const semis = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(3), identidade), false)
    )
    const soFinal = gerarProximaFase(semis, { idaEVolta: false, terceiroLugar: true })
    expect(soFinal).toHaveLength(1)
    expect(soFinal[0].posicao).toBe(1)
  })

  it("ida-e-volta gera duas pernas nas fases intermediárias", () => {
    const r1 = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(8), identidade), true)
    )
    const r2 = gerarProximaFase(r1, { idaEVolta: true, terceiroLugar: false })
    expect(r2).toHaveLength(4) // 2 confrontos × 2 pernas (semis não são a final)
    const slot1 = r2.filter((p) => p.posicao === 1)
    expect(slot1.map((p) => p.perna)).toEqual([1, 2])
    expect(slot1[1].participante_1).toBe(slot1[0].participante_2)
  })

  it("final existente → nada a gerar ([])", () => {
    const r1 = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(2), identidade), false)
    )
    expect(gerarProximaFase(r1, { idaEVolta: false, terceiroLugar: false })).toEqual([])
  })

  it("geometria derivada da chave persistida, não do nº de participantes", () => {
    const r1 = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(6), identidade), false)
    )
    expect(tamanhoChaveDasPartidas(r1)).toBe(8) // byes contam na geometria
  })
})

describe("previaMataMata bate com a simulação do motor", () => {
  for (const idaEVolta of [false, true]) {
    for (const terceiroLugar of [false, true]) {
      it(`todos os N de 2 a 32 (idaEVolta=${idaEVolta}, terceiro=${terceiroLugar})`, () => {
        for (let n = 2; n <= MATA_MATA_MAX_PARTICIPANTES; n++) {
          let fase = gerarFaseInicial(
            montarConfrontosSorteio(ids(n), identidade),
            idaEVolta
          )
          let jogos = fase.filter((p) => !p.bye).length
          let fases = 1
          const todas: PartidaJogada[] = [...encerrarFase(fase)]
          for (;;) {
            const proxima = gerarProximaFase(todas, { idaEVolta, terceiroLugar })
            if (proxima.length === 0) break
            fases++
            jogos += proxima.filter((p) => !p.bye).length
            // Pernas do mesmo confronto contam como 1? NÃO: prévia conta JOGOS.
            fase = proxima
            todas.push(...encerrarFase(proxima))
          }
          const previa = previaMataMata(n, idaEVolta, terceiroLugar)
          expect({ n, jogos, fases }).toEqual({
            n,
            jogos: previa.jogos,
            fases: previa.fases,
          })
        }
      })
    }
  }
})

describe("rótulos e 3º lugar", () => {
  it("rotuloFase nomeia pelas quantidades", () => {
    expect(rotuloFase(1, 1)).toBe("Final")
    expect(rotuloFase(1, 2)).toBe("Semifinais")
    expect(rotuloFase(2, 2)).toBe("Final")
    expect(rotuloFase(1, 3)).toBe("Quartas de final")
    expect(rotuloFase(1, 4)).toBe("Oitavas de final")
    expect(rotuloFase(1, 5)).toBe("1ª fase")
    expect(rotuloFase(2, 5)).toBe("Oitavas de final")
  })

  it("ehTerceiroLugar identifica a posicao 2 da rodada final", () => {
    expect(ehTerceiroLugar(2, 2, 2)).toBe(true)
    expect(ehTerceiroLugar(2, 1, 2)).toBe(false)
    expect(ehTerceiroLugar(1, 2, 2)).toBe(false)
    expect(ehTerceiroLugar(null, null, 2)).toBe(false)
  })
})

/**
 * Rodada-base != 1 — a chave nasce APÓS a fase de grupos (rodadas contínuas,
 * D2 do add-group-stage-format). O motor não pode mais assumir "fase 1 =
 * rodada 1": tamanho, base e avanço derivam das partidas com `posicao`, e as
 * partidas de GRUPO (posicao null) que convivem no mesmo lote são ignoradas.
 */
describe("rodada-base (chave após fase de grupos)", () => {
  /** Partidas de grupo do mesmo torneio: têm rodada mas NÃO têm posicao. */
  function partidasDeGrupo(): PartidaJogada[] {
    return [1, 2, 3].map((rodada) => ({
      rodada,
      posicao: null,
      perna: null,
      participante_1: "g1",
      participante_2: "g2",
      placar_1: 1,
      placar_2: 0,
      status: "encerrada" as const,
    }))
  }

  it("gerarFaseInicial com rodadaBase posiciona toda a fase na rodada informada", () => {
    const partidas = gerarFaseInicial(
      montarConfrontosSorteio(ids(4), identidade),
      false,
      5
    )
    expect(partidas).toHaveLength(2)
    expect(partidas.every((p) => p.rodada === 5)).toBe(true)
  })

  it("rodadaBaseDaChave ignora partidas sem posicao e acha a MENOR rodada com posicao", () => {
    // Partidas de grupo (posicao null, rodadas 1..3) NÃO podem rebaixar a base
    // da chave: a base é o piso das rodadas que têm posicao (a chave em si).
    const chave = gerarFaseInicial(
      montarConfrontosSorteio(ids(4), identidade),
      false,
      5
    )
    const todas: PartidaJogada[] = [
      ...partidasDeGrupo(),
      ...chave.map((p) => ({
        rodada: p.rodada,
        posicao: p.posicao,
        perna: p.perna,
        participante_1: p.participante_1,
        participante_2: p.participante_2,
        placar_1: 0,
        placar_2: 0,
        status: "agendada" as const,
      })),
    ]
    expect(rodadaBaseDaChave(todas)).toBe(5)
  })

  it("tamanhoChaveDasPartidas mede a chave na rodada-base (não na rodada 1)", () => {
    // Posicoes 1 e 2 na rodada 5 ⇒ chave de 4, mesmo com lixo de grupo antes.
    const chave = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(4), identidade), false, 5)
    )
    expect(tamanhoChaveDasPartidas([...partidasDeGrupo(), ...chave])).toBe(4)
  })

  it("gerarProximaFase: chave de 4 na base 5 encerra a fase 1 e gera a FINAL na rodada 6, ignorando partidas de grupo no lote", () => {
    // Fase 1 = rodada 5 encerrada ⇒ próxima fase (final) na rodada 6. As
    // partidas de grupo (rodada 1..3, posicao null) compartilham o lote mas
    // são filtradas: não viram base, não viram slot, não afetam o avanço.
    const semis = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(4), identidade), false, 5)
    )
    const proxima = gerarProximaFase([...partidasDeGrupo(), ...semis], {
      idaEVolta: false,
      terceiroLugar: false,
    })
    expect(proxima).toHaveLength(1)
    expect(proxima[0]).toMatchObject({
      rodada: 6,
      posicao: 1,
      participante_1: "p01",
      participante_2: "p03",
    })
  })

  it("semifinais em base != 1 com 3º lugar geram final + 3º na rodada certa", () => {
    // Chave de 4 começando na rodada 7: a fase final cai na rodada 8 (final
    // posicao 1 + disputa de 3º posicao 2), independente da base.
    const semis = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(4), identidade), false, 7)
    )
    const finalETerceiro = gerarProximaFase(semis, {
      idaEVolta: false,
      terceiroLugar: true,
    })
    expect(finalETerceiro).toHaveLength(2)
    expect(finalETerceiro[0]).toMatchObject({
      rodada: 8,
      posicao: 1,
      participante_1: "p01",
      participante_2: "p03",
    })
    expect(finalETerceiro[1]).toMatchObject({
      rodada: 8,
      posicao: POSICAO_TERCEIRO_LUGAR,
      participante_1: "p02",
      participante_2: "p04",
    })
  })

  it("chave em base 5 já decidida (final existe) → nada a gerar ([])", () => {
    // Chave de 2 começando na rodada 5: a fase 1 (rodada 5) JÁ é a final.
    // Encerrada, faseAtual === fases ⇒ avanço devolve [].
    const finalUnica = encerrarFase(
      gerarFaseInicial(montarConfrontosSorteio(ids(2), identidade), false, 5)
    )
    expect(
      gerarProximaFase([...partidasDeGrupo(), ...finalUnica], {
        idaEVolta: false,
        terceiroLugar: false,
      })
    ).toEqual([])
  })

  it("equivalência: a MESMA chave em base 1 e base 7 produz os mesmos resultados relativos", () => {
    // Invariância da generalização: deslocar a rodada-base não muda a chave —
    // só as rodadas absolutas. Normalizando pela base (fase relativa), as duas
    // execuções coincidem em posicao/perna/participantes/fase.
    function simular(base: number) {
      const confrontos = montarConfrontosSorteio(ids(8), identidade)
      const fase = gerarFaseInicial(confrontos, false, base)
      const todas: PartidaJogada[] = [...encerrarFase(fase)]
      const eventos: Array<{
        faseRelativa: number
        posicao: number
        perna: number | null
        participante_1: string
        participante_2: string | null
      }> = fase.map((p) => ({
        faseRelativa: p.rodada - base + 1,
        posicao: p.posicao,
        perna: p.perna,
        participante_1: p.participante_1,
        participante_2: p.participante_2,
      }))
      for (;;) {
        const proxima = gerarProximaFase(todas, {
          idaEVolta: false,
          terceiroLugar: false,
        })
        if (proxima.length === 0) break
        for (const p of proxima) {
          eventos.push({
            faseRelativa: p.rodada - base + 1,
            posicao: p.posicao,
            perna: p.perna,
            participante_1: p.participante_1,
            participante_2: p.participante_2,
          })
        }
        todas.push(...encerrarFase(proxima))
      }
      return eventos
    }

    expect(simular(7)).toEqual(simular(1))
  })
})

/* -------------------------------------------------------------------------- */
/* Playoff de liga (Fase 2): seeding por posição + leitura do resultado        */
/* -------------------------------------------------------------------------- */

describe("ordemDeSeed", () => {
  it("espalhamento padrão (seed 1 e 2 em metades opostas)", () => {
    expect(ordemDeSeed(2)).toEqual([1, 2])
    expect(ordemDeSeed(4)).toEqual([1, 4, 2, 3])
    expect(ordemDeSeed(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    expect(ordemDeSeed(16)).toEqual([
      1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11,
    ])
  })

  it("cada par tem o melhor seed à esquerda", () => {
    for (const s of [4, 8, 16, 32]) {
      const o = ordemDeSeed(s)
      for (let i = 0; i < s / 2; i++) {
        expect(o[2 * i]).toBeLessThan(o[2 * i + 1])
      }
    }
  })
})

describe("semearPlayoffPorPosicao", () => {
  it("chave de 8 completa: melhor x pior, espalhado", () => {
    const c = semearPlayoffPorPosicao(ids(8))
    expect(c).toEqual([
      { posicao: 1, participante_1: "p01", participante_2: "p08" },
      { posicao: 2, participante_1: "p04", participante_2: "p05" },
      { posicao: 3, participante_1: "p02", participante_2: "p07" },
      { posicao: 4, participante_1: "p03", participante_2: "p06" },
    ])
  })

  it("byes vão para os melhores seeds (lado 2 fantasma)", () => {
    // N=6, chave de 8 → seeds 7,8 são fantasmas; seeds 1,2 ganham bye.
    const c = semearPlayoffPorPosicao(ids(6))
    expect(c).toEqual([
      { posicao: 1, participante_1: "p01", participante_2: null }, // seed 8 fantasma
      { posicao: 2, participante_1: "p04", participante_2: "p05" },
      { posicao: 3, participante_1: "p02", participante_2: null }, // seed 7 fantasma
      { posicao: 4, participante_1: "p03", participante_2: "p06" },
    ])
  })

  it("é determinístico (sem aleatoriedade) e cobre todos os participantes", () => {
    const a = semearPlayoffPorPosicao(ids(5))
    const b = semearPlayoffPorPosicao(ids(5))
    expect(a).toEqual(b)
    const usados = a.flatMap((c) =>
      [c.participante_1, c.participante_2].filter((p): p is string => p !== null)
    )
    expect([...usados].sort()).toEqual(ids(5))
  })
})

describe("resultadoDaChave", () => {
  /** Jogo encerrado de chave (perna null = jogo único). */
  const jogo = (
    rodada: number,
    posicao: number,
    p1: string,
    p2: string | null,
    placar1: number,
    placar2: number,
    perna: number | null = null
  ): PartidaJogada => ({
    rodada,
    posicao,
    perna,
    participante_1: p1,
    participante_2: p2,
    placar_1: placar1,
    placar_2: placar2,
    status: "encerrada",
    woVencedor: null,
  })

  // Round 1 de uma chave de 8 onde o MELHOR seed sempre vence (1-0).
  // Confrontos: 1×8, 4×5, 2×7, 3×6 (semearPlayoffPorPosicao).
  const round1de8 = [
    jogo(1, 1, "p01", "p08", 1, 0),
    jogo(1, 2, "p04", "p05", 1, 0),
    jogo(1, 3, "p02", "p07", 1, 0),
    jogo(1, 4, "p03", "p06", 1, 0),
  ]

  it("vagas / playoff_acesso: os 4 vencedores da 1ª rodada SOBEM (8→4)", () => {
    const r = resultadoDaChave(round1de8, {
      modo: "playoff_acesso",
      estilo: "vagas",
      vagas: 4,
      playoffVagas: 8,
    })
    expect(r.decidida).toBe(true)
    expect([...r.sobem].sort()).toEqual(["p01", "p02", "p03", "p04"])
    expect([...r.permanecem].sort()).toEqual(["p05", "p06", "p07", "p08"])
    expect(r.caem.size).toBe(0)
    // cobertura total
    expect(r.sobem.size + r.caem.size + r.permanecem.size).toBe(8)
  })

  it("vagas / playout: os 4 perdedores da 1ª rodada CAEM, sobreviventes salvam", () => {
    const r = resultadoDaChave(round1de8, {
      modo: "playout",
      estilo: "vagas",
      vagas: 4, // vagas_rebaixamento
      playoffVagas: 8, // sobreviventes = 4 (potência de 2)
    })
    expect(r.decidida).toBe(true)
    expect([...r.caem].sort()).toEqual(["p05", "p06", "p07", "p08"])
    expect([...r.permanecem].sort()).toEqual(["p01", "p02", "p03", "p04"])
    expect(r.sobem.size).toBe(0)
  })

  it("vagas: 8→2 exige DUAS rodadas (f=2); 1 rodada não decide", () => {
    const opts = {
      modo: "playoff_acesso" as const,
      estilo: "vagas" as const,
      vagas: 2,
      playoffVagas: 8,
    }
    // só round 1 → ainda não decidida (precisa da rodada 2).
    expect(resultadoDaChave(round1de8, opts).decidida).toBe(false)
    // round 2 (semis): vencedores de 1×4 e 2×3 → finalistas.
    const round2 = [jogo(2, 1, "p01", "p04", 1, 0), jogo(2, 2, "p02", "p03", 1, 0)]
    const r = resultadoDaChave([...round1de8, ...round2], opts)
    expect(r.decidida).toBe(true)
    expect([...r.sobem].sort()).toEqual(["p01", "p02"])
    expect(r.permanecem.size).toBe(6)
  })

  it("extra / playoff_acesso: só o CAMPEÃO sobe; resto permanece", () => {
    // chave de 4 (1×4, 2×3) → final 1×2 → campeão p01.
    const partidas = [
      jogo(1, 1, "p01", "p04", 2, 0),
      jogo(1, 2, "p02", "p03", 2, 0),
      jogo(2, 1, "p01", "p02", 1, 0), // final
    ]
    const r = resultadoDaChave(partidas, {
      modo: "playoff_acesso",
      estilo: "extra",
      vagas: 0,
      playoffVagas: 4,
    })
    expect(r.decidida).toBe(true)
    expect([...r.sobem]).toEqual(["p01"])
    expect([...r.permanecem].sort()).toEqual(["p02", "p03", "p04"])
  })

  it("extra / playout: o PERDEDOR DA FINAL cai; campeão se salva", () => {
    const partidas = [
      jogo(1, 1, "p01", "p04", 2, 0),
      jogo(1, 2, "p02", "p03", 2, 0),
      jogo(2, 1, "p01", "p02", 1, 0), // final: p02 perde
    ]
    const r = resultadoDaChave(partidas, {
      modo: "playout",
      estilo: "extra",
      vagas: 0,
      playoffVagas: 4,
    })
    expect(r.decidida).toBe(true)
    expect([...r.caem]).toEqual(["p02"])
    expect([...r.permanecem].sort()).toEqual(["p01", "p03", "p04"])
  })

  it("extra: final em aberto ⇒ não decidida", () => {
    const partidas = [
      jogo(1, 1, "p01", "p04", 2, 0),
      jogo(1, 2, "p02", "p03", 2, 0),
      // sem a final
    ]
    expect(
      resultadoDaChave(partidas, {
        modo: "playoff_acesso",
        estilo: "extra",
        vagas: 0,
        playoffVagas: 4,
      }).decidida
    ).toBe(false)
  })

  it("extra ida-e-volta: agregado decide o confronto (sem gol fora)", () => {
    // chave de 2 (final direta, jogo único pelo motor) — testa agregado numa semi
    // de chave de 4 ida-e-volta: 1×4 agregado 3x2 → p01 avança.
    const partidas = [
      jogo(1, 1, "p01", "p04", 1, 2, 1), // ida
      jogo(1, 1, "p04", "p01", 0, 2, 2), // volta (lados invertidos): agg p01 = 1+2=3, p04 = 2+0=2
      jogo(1, 2, "p02", "p03", 2, 0, 1),
      jogo(1, 2, "p03", "p02", 0, 1, 2), // agg p02 = 2+1=3, p03 = 0+0=0
      jogo(2, 1, "p01", "p02", 1, 0), // final jogo único
    ]
    const r = resultadoDaChave(partidas, {
      modo: "playoff_acesso",
      estilo: "extra",
      vagas: 0,
      playoffVagas: 4,
    })
    expect(r.decidida).toBe(true)
    expect([...r.sobem]).toEqual(["p01"])
  })

  it("sem partidas ⇒ indecisa, conjuntos vazios", () => {
    const r = resultadoDaChave([], {
      modo: "playoff_acesso",
      estilo: "vagas",
      vagas: 4,
      playoffVagas: 8,
    })
    expect(r.decidida).toBe(false)
    expect(r.sobem.size + r.caem.size + r.permanecem.size).toBe(0)
  })
})

describe("resultadoDaChave (defensivo contra config inválida)", () => {
  const jogo2 = (
    rodada: number,
    posicao: number,
    p1: string,
    p2: string,
    pl1: number,
    pl2: number
  ): PartidaJogada => ({
    rodada,
    posicao,
    perna: null,
    participante_1: p1,
    participante_2: p2,
    placar_1: pl1,
    placar_2: pl2,
    status: "encerrada",
    woVencedor: null,
  })

  it("playout 'vagas' com vagas==playoffVagas (alvo=0) ⇒ INDECISA (não decide errado)", () => {
    // 8 jogam, "8 caem" ⇒ sobreviventes=0: configuração impossível no 'vagas'.
    const round1 = [
      jogo2(1, 1, "a", "b", 1, 0),
      jogo2(1, 2, "c", "d", 1, 0),
      jogo2(1, 3, "e", "f", 1, 0),
      jogo2(1, 4, "g", "h", 1, 0),
    ]
    const r = resultadoDaChave(round1, {
      modo: "playout",
      estilo: "vagas",
      vagas: 8,
      playoffVagas: 8,
    })
    expect(r.decidida).toBe(false)
    expect(r.caem.size).toBe(0)
  })

  it("acesso 'vagas' com nº não-potência-de-2 (3 de 8) ⇒ INDECISA", () => {
    const round1 = [
      jogo2(1, 1, "a", "b", 1, 0),
      jogo2(1, 2, "c", "d", 1, 0),
      jogo2(1, 3, "e", "f", 1, 0),
      jogo2(1, 4, "g", "h", 1, 0),
    ]
    const r = resultadoDaChave(round1, {
      modo: "playoff_acesso",
      estilo: "vagas",
      vagas: 3,
      playoffVagas: 8,
    })
    expect(r.decidida).toBe(false)
  })
})
