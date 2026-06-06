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
  POSICAO_TERCEIRO_LUGAR,
  previaMataMata,
  rotuloFase,
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
