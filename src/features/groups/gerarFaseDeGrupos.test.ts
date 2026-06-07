import { describe, expect, it } from "vitest"

import {
  classificarGrupos,
  cruzarClassificados,
  gerarPartidasGrupos,
  montarGruposManual,
  montarGruposPotes,
  montarGruposSorteio,
  ordemBracket,
  previaGrupos,
  rotuloGrupo,
  validarGeometria,
  type PartidaGrupoJogada,
} from "@/features/groups/gerarFaseDeGrupos"
import {
  gerarFaseInicial,
  gerarProximaFase,
  type ConfrontoChave,
  type PartidaChave,
  type PartidaJogada,
  type RandInt,
} from "@/features/knockout/gerarChaveMataMata"
import type { RegrasPontuacao } from "@/features/standings/computeStandings"

/** Sem troca no Fisher-Yates (j = i): preserva a ordem de entrada (IDENTIDADE). */
const identidade: RandInt = (n) => n - 1

/** Sempre 0: permutação determinística NÃO-trivial (rotaciona). */
const sempreZero: RandInt = () => 0

const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, "0")}`)

const REGRAS: RegrasPontuacao = { vitoria: 3, empate: 1, derrota: 0 }

describe("validarGeometria", () => {
  it("rejeita G fora de {1,2,4,8} — o pareamento de grupos exige potência de 2", () => {
    // G=3 não fecha em pares no cruzamento; G·K poderia até ser potência de 2.
    expect(() => validarGeometria(12, 3, 2)).toThrow(/grupos inválida/i)
    expect(() => validarGeometria(16, 16, 1)).toThrow(/grupos inválida/i)
  })

  it("rejeita G·K fora de {2,4,8,16,32} — a chave nasceria incompleta (byes pós-grupos)", () => {
    // G=2 K=3 → total 6, não é potência de 2: a chave precisaria de bye, e o
    // produto proíbe ranking cruzado para preencher (non-goal).
    expect(() => validarGeometria(12, 2, 3)).toThrow(/chave completa/i)
    expect(() => validarGeometria(10, 1, 5)).toThrow(/chave completa/i)
  })

  it("rejeita menor grupo < 2 — sem dois participantes não há jogo no grupo", () => {
    // N=4 em 4 grupos → 1 por grupo: não existe confronto interno.
    expect(() => validarGeometria(4, 4, 1)).toThrow(/mínimo 2 por grupo/i)
  })

  it("rejeita K >= menor grupo — classificar todos não é eliminatória", () => {
    // N=8 em 2 grupos (4 cada) com K=4: classificaria o grupo inteiro.
    expect(() => validarGeometria(8, 2, 4)).toThrow(/no máximo/i)
  })

  it("aceita as geometrias canônicas (Copa, Champions e grupos desiguais)", () => {
    // Copa mínima: G=2 K=2 com N=8 (grupos de 4, classifica 2).
    expect(() => validarGeometria(8, 2, 2)).not.toThrow()
    // Champions (G=1): K=8 com N=10 — grupo único de 10, classifica 8.
    expect(() => validarGeometria(10, 1, 8)).not.toThrow()
    // N não-múltiplo: G=4 K=2 com N=13 → grupos 4/3/3/3, menor grupo 3 > K=2.
    expect(() => validarGeometria(13, 4, 2)).not.toThrow()
  })
})

describe("montarGruposSorteio", () => {
  it("equilibra ±1 para N não-múltiplo (N=10 em 4 grupos → 3/3/2/2)", () => {
    // Distribuição round-robin: as sobras caem nos primeiros grupos.
    const grupos = montarGruposSorteio(ids(10), 4, identidade)
    expect(grupos.map((g) => g.length)).toEqual([3, 3, 2, 2])
  })

  it("usa cada participante exatamente uma vez (partição da entrada)", () => {
    const grupos = montarGruposSorteio(ids(10), 4, sempreZero)
    const todos = grupos.flat()
    expect([...todos].sort()).toEqual(ids(10))
  })

  it("é determinístico com randInt identidade (sem embaralhar, ordem de entrada)", () => {
    // Identidade não troca: round-robin direto sobre a ordem dada.
    const grupos = montarGruposSorteio(ids(8), 2, identidade)
    expect(grupos).toEqual([
      ["p01", "p03", "p05", "p07"],
      ["p02", "p04", "p06", "p08"],
    ])
  })

  it("rejeita participantes duplicados (entrada corrompida)", () => {
    expect(() => montarGruposSorteio(["a", "a", "b", "c"], 2, identidade)).toThrow(
      /duplicados/i
    )
  })
})

describe("montarGruposPotes", () => {
  it("coloca exatamente G cabeças, uma por grupo (cada grupo[0] é cabeça)", () => {
    const cabecas = ["c1", "c2"]
    const demais = ["d1", "d2", "d3", "d4"]
    const grupos = montarGruposPotes(cabecas, demais, 2, identidade)
    expect(grupos).toHaveLength(2)
    for (const g of grupos) {
      expect(cabecas).toContain(g[0]) // o primeiro de cada grupo é uma cabeça
    }
    // As G cabeças aparecem em grupos distintos (uma por grupo).
    const cabecasNosGrupos = grupos.map((g) => g[0])
    expect([...cabecasNosGrupos].sort()).toEqual([...cabecas].sort())
  })

  it("distribui todos e só os participantes informados (partição completa)", () => {
    const grupos = montarGruposPotes(["c1", "c2"], ["d1", "d2", "d3", "d4"], 2, sempreZero)
    expect([...grupos.flat()].sort()).toEqual(
      ["c1", "c2", "d1", "d2", "d3", "d4"].sort()
    )
  })

  it("rejeita nº de cabeças != G (uma e só uma cabeça por grupo)", () => {
    // 3 cabeças para 2 grupos: sobraria cabeça sem grupo próprio.
    expect(() =>
      montarGruposPotes(["c1", "c2", "c3"], ["d1", "d2", "d3"], 2, identidade)
    ).toThrow(/exatamente 2 cabeças/i)
  })

  it("rejeita duplicados entre cabeças e demais (entrada corrompida)", () => {
    expect(() =>
      montarGruposPotes(["c1", "c2"], ["c1", "d2", "d3", "d4"], 2, identidade)
    ).toThrow(/duplicados/i)
  })
})

describe("montarGruposManual", () => {
  it("aceita a partição exata informada pelo dono (preserva a atribuição)", () => {
    const grupos = montarGruposManual(
      [
        ["p01", "p02"],
        ["p03", "p04"],
      ],
      ids(4)
    )
    expect(grupos).toEqual([
      ["p01", "p02"],
      ["p03", "p04"],
    ])
  })

  it("rejeita desequilíbrio > 1 (grupos muito desiguais quebram o corte)", () => {
    // 3 × 1: diferença 2 — a prévia e a linha de corte ficariam injustas.
    expect(() =>
      montarGruposManual([["p01", "p02", "p03"], ["p04"]], ids(4))
    ).toThrow(/equilibrados/i)
  })

  it("rejeita participante de fora da lista de confirmados (intruso)", () => {
    expect(() =>
      montarGruposManual([["p01", "intruso"], ["p03", "p04"]], ids(4))
    ).toThrow(/somente eles/i)
  })

  it("rejeita participante faltando (partição incompleta)", () => {
    // p04 confirmado mas não atribuído a nenhum grupo.
    expect(() =>
      montarGruposManual([["p01", "p02"], ["p03"]], ids(4))
    ).toThrow(/somente eles/i)
  })

  it("rejeita o mesmo participante em dois grupos (não-partição)", () => {
    expect(() =>
      montarGruposManual([["p01", "p02"], ["p01", "p04"]], ids(4))
    ).toThrow(/único grupo/i)
  })
})

describe("gerarPartidasGrupos", () => {
  it("em cada grupo todos os pares se enfrentam exatamente 1x (turno único)", () => {
    // 2 grupos de 4 → C(4,2)=6 confrontos por grupo, 12 no total.
    const grupos = [ids(4), ids(4).map((p) => `q${p}`)]
    const partidas = gerarPartidasGrupos(grupos, false)
    expect(partidas).toHaveLength(12)
    // Cada par do grupo 1 aparece exatamente uma vez (ignora o mando).
    const paresGrupo1 = partidas
      .filter((p) => p.grupo === 1)
      .map((p) => [p.participante_1, p.participante_2].sort().join("|"))
    expect(new Set(paresGrupo1).size).toBe(6)
  })

  it("ida-e-volta dobra: cada par do grupo se enfrenta 2x", () => {
    const grupos = [ids(4)]
    const ida = gerarPartidasGrupos(grupos, false).length
    const idaEVolta = gerarPartidasGrupos(grupos, true).length
    expect(idaEVolta).toBe(ida * 2)
  })

  it("nenhuma partida cruza grupos (membros de grupos distintos não se enfrentam)", () => {
    const grupos = [ids(3), ids(3).map((p) => `q${p}`)]
    const partidas = gerarPartidasGrupos(grupos, false)
    const doGrupo1 = new Set(grupos[0])
    const doGrupo2 = new Set(grupos[1])
    for (const p of partidas) {
      const ambosNoMesmo =
        (doGrupo1.has(p.participante_1) && doGrupo1.has(p.participante_2)) ||
        (doGrupo2.has(p.participante_1) && doGrupo2.has(p.participante_2))
      expect(ambosNoMesmo).toBe(true)
    }
  })

  it("grupos correm em PARALELO: G1 e G2 ambos têm rodada 1", () => {
    // A rodada é interna ao grupo — não é contínua entre grupos.
    const grupos = [ids(4), ids(4).map((p) => `q${p}`)]
    const partidas = gerarPartidasGrupos(grupos, false)
    const rodadasG1 = new Set(partidas.filter((p) => p.grupo === 1).map((p) => p.rodada))
    const rodadasG2 = new Set(partidas.filter((p) => p.grupo === 2).map((p) => p.rodada))
    expect(rodadasG1.has(1)).toBe(true)
    expect(rodadasG2.has(1)).toBe(true)
  })

  it("grupo ímpar herda a folga da liga (rodada existe sem todos jogando)", () => {
    // Grupo de 3 → 3 rodadas, mas cada rodada tem 1 jogo (um descansa).
    const partidas = gerarPartidasGrupos([ids(3)], false)
    expect(partidas).toHaveLength(3) // C(3,2)
    const porRodada = new Map<number, number>()
    for (const p of partidas) porRodada.set(p.rodada, (porRodada.get(p.rodada) ?? 0) + 1)
    // 3 rodadas, 1 jogo cada — a folga não vira partida (herdada do gerarTabelaLiga).
    expect([...porRodada.values()]).toEqual([1, 1, 1])
  })
})

/** Constrói a linha persistida de uma partida de grupo encerrada com placar. */
function jogoGrupo(
  grupo: number,
  p1: string,
  p2: string,
  placar1: number,
  placar2: number
): PartidaGrupoJogada {
  return {
    grupo,
    rodada: 1,
    participante_1: p1,
    participante_2: p2,
    placar_1: placar1,
    placar_2: placar2,
    status: "encerrada",
  }
}

describe("classificarGrupos", () => {
  it("corta os K primeiros pela ordem do computeStandings (sem empate na fronteira)", () => {
    // Grupo único de 3, K=2: a×b 3x0, a×c 3x0, b×c 3x0 → a(6) > b(3) > c(0).
    const partidas = [
      jogoGrupo(1, "a", "b", 3, 0),
      jogoGrupo(1, "a", "c", 3, 0),
      jogoGrupo(1, "b", "c", 3, 0),
    ]
    const r = classificarGrupos(partidas, REGRAS, 1, 2, identidade)
    expect(r.classificados).toEqual([["a", "b"]])
    expect(r.sorteioUsado).toBe(false)
  })

  it("empate dividido CRUZANDO a linha de corte → sorteio (sorteioUsado=true, K exato)", () => {
    // Grupo de 4, K=2: a vence todos (1º); b, c, d ficam IDÊNTICOS e empatam
    // entre si (todos 0x0) → bloco de 3 na 2ª posição, com 1 vaga só.
    const partidas = [
      jogoGrupo(1, "a", "b", 1, 0),
      jogoGrupo(1, "a", "c", 1, 0),
      jogoGrupo(1, "a", "d", 1, 0),
      jogoGrupo(1, "b", "c", 0, 0),
      jogoGrupo(1, "b", "d", 0, 0),
      jogoGrupo(1, "c", "d", 0, 0),
    ]
    const r = classificarGrupos(partidas, REGRAS, 1, 2, identidade)
    expect(r.sorteioUsado).toBe(true)
    expect(r.classificados[0]).toHaveLength(2) // K exato apesar do empate triplo
    expect(r.classificados[0][0]).toBe("a") // o 1º não é afetado pelo sorteio
    // Identidade no embaralhar = mantém ordem; o primeiro empatado entra.
    expect(r.classificados[0][1]).toBe("b")
  })

  it("empate dividido que NÃO cruza a linha de corte → sem sorteio", () => {
    // Grupo de 4, K=2: a e b idênticos no topo (cluster que cabe nas 2 vagas);
    // c e d ficam abaixo. O empate dividido está INTEIRO acima do corte.
    const partidas = [
      jogoGrupo(1, "a", "c", 1, 0),
      jogoGrupo(1, "a", "d", 1, 0),
      jogoGrupo(1, "b", "c", 1, 0),
      jogoGrupo(1, "b", "d", 1, 0),
      jogoGrupo(1, "a", "b", 0, 0), // a e b empatam o confronto direto → dividem 1º
      jogoGrupo(1, "c", "d", 0, 0),
    ]
    const r = classificarGrupos(partidas, REGRAS, 1, 2, identidade)
    expect(r.sorteioUsado).toBe(false)
    expect([...r.classificados[0]].sort()).toEqual(["a", "b"])
  })

  it("bloco maior que as vagas NO MEIO do corte (não na fronteira inicial) → sorteio", () => {
    // Grupo de 4, K=3: a sozinho no 1º; b, c, d empatados (bloco 3) com 2 vagas
    // restantes → o bloco cruza a linha entre a 2ª e a 3ª vaga.
    const partidas = [
      jogoGrupo(1, "a", "b", 1, 0),
      jogoGrupo(1, "a", "c", 1, 0),
      jogoGrupo(1, "a", "d", 1, 0),
      jogoGrupo(1, "b", "c", 0, 0),
      jogoGrupo(1, "b", "d", 0, 0),
      jogoGrupo(1, "c", "d", 0, 0),
    ]
    const r = classificarGrupos(partidas, REGRAS, 1, 3, identidade)
    expect(r.sorteioUsado).toBe(true)
    expect(r.classificados[0]).toHaveLength(3)
    expect(r.classificados[0][0]).toBe("a")
    // 2 das 3 vagas restantes vão para os primeiros do bloco empatado (identidade).
    expect(r.classificados[0].slice(1)).toEqual(["b", "c"])
  })
})

describe("ordemBracket", () => {
  it("expande pela recursão clássica de seeding (1 e 2 em metades opostas)", () => {
    expect(ordemBracket(1)).toEqual([1])
    expect(ordemBracket(2)).toEqual([1, 2])
    expect(ordemBracket(4)).toEqual([1, 4, 2, 3])
    expect(ordemBracket(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
  })
})

describe("cruzarClassificados", () => {
  it("G=1 K=8 (Champions): seeds i×K+1−i nos slots da ordem de bracket", () => {
    // seeds s1..s8; pares [s1,s8],[s2,s7],[s3,s6],[s4,s5]; ordemBracket(4)=[1,4,2,3].
    const seeds = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"]
    const confrontos = cruzarClassificados([seeds])
    expect(confrontos).toEqual<ConfrontoChave[]>([
      { posicao: 1, participante_1: "s1", participante_2: "s8" },
      { posicao: 2, participante_1: "s4", participante_2: "s5" },
      { posicao: 3, participante_1: "s2", participante_2: "s7" },
      { posicao: 4, participante_1: "s3", participante_2: "s6" },
    ])
  })

  it("G=1 K=4: dois pares [1×4, 2×3] nas posições da ordemBracket(2)=[1,2]", () => {
    const confrontos = cruzarClassificados([["s1", "s2", "s3", "s4"]])
    expect(confrontos).toEqual<ConfrontoChave[]>([
      { posicao: 1, participante_1: "s1", participante_2: "s4" },
      { posicao: 2, participante_1: "s2", participante_2: "s3" },
    ])
  })

  it("G=4 K=2 (Copa): metade 1 A1×B2,C1×D2; metade 2 com lados invertidos B1×A2,D1×C2", () => {
    const confrontos = cruzarClassificados([
      ["A1", "A2"],
      ["B1", "B2"],
      ["C1", "C2"],
      ["D1", "D2"],
    ])
    expect(confrontos).toEqual<ConfrontoChave[]>([
      { posicao: 1, participante_1: "A1", participante_2: "B2" },
      { posicao: 2, participante_1: "C1", participante_2: "D2" },
      { posicao: 3, participante_1: "B1", participante_2: "A2" },
      { posicao: 4, participante_1: "D1", participante_2: "C2" },
    ])
  })

  it("G=2 K=1: os vencedores de grupo se enfrentam direto (A1×B1)", () => {
    const confrontos = cruzarClassificados([["A1"], ["B1"]])
    expect(confrontos).toEqual<ConfrontoChave[]>([
      { posicao: 1, participante_1: "A1", participante_2: "B1" },
    ])
  })

  it("rejeita classificação incompleta (grupos de tamanhos diferentes)", () => {
    expect(() => cruzarClassificados([["A1", "A2"], ["B1"]])).toThrow(/incompleta/i)
  })

  it("G=2 K=4 PINADO: separação máxima possível (mesmo grupo pode se cruzar na 2ª fase)", () => {
    // 8 classificados de 2 grupos: confrontos A_i × B_{5−i}; i ímpar na
    // metade 1 (slots 1-2), i par na metade 2 com lados invertidos. A1
    // (slot 1) e A3 (slot 2) PODEM se encontrar na semifinal — inerente a
    // poucos grupos com muitos classificados (promessa corrigida no D4 pela
    // validação adversarial). Este pino impede "correção" regressiva.
    const a = ["A1", "A2", "A3", "A4"]
    const b = ["B1", "B2", "B3", "B4"]
    expect(cruzarClassificados([a, b])).toEqual<ConfrontoChave[]>([
      { posicao: 1, participante_1: "A1", participante_2: "B4" },
      { posicao: 2, participante_1: "A3", participante_2: "B2" },
      { posicao: 3, participante_1: "B3", participante_2: "A2" },
      { posicao: 4, participante_1: "B1", participante_2: "A4" },
    ])
  })
})

/** Encerra as partidas de uma fase de chave: lado 1 vence (volta 0x0). */
function encerrarFase(novas: PartidaChave[]): PartidaJogada[] {
  return novas.map((p) => ({
    rodada: p.rodada,
    posicao: p.posicao,
    perna: p.perna,
    participante_1: p.participante_1,
    participante_2: p.participante_2,
    placar_1: p.bye || p.perna === 2 ? 0 : 1,
    placar_2: 0,
    status: "encerrada",
  }))
}

/**
 * Simula a fase de grupos + a chave inteira e devolve as contagens reais para
 * cruzar com a prévia (fonte única). Os grupos são montados por sorteio com
 * identidade (round-robin determinístico).
 */
function simular(
  n: number,
  qtdGrupos: number,
  classificadosPorGrupo: number,
  idaEVolta: boolean,
  terceiroLugar: boolean
) {
  const grupos = montarGruposSorteio(ids(n), qtdGrupos, identidade)
  const partidasGrupos = gerarPartidasGrupos(grupos, idaEVolta)
  const jogosGrupos = partidasGrupos.length
  const rodadasGrupos = Math.max(...partidasGrupos.map((p) => p.rodada))

  // Classificados determinísticos: os K primeiros de cada grupo (sem precisar
  // jogar — a contagem da chave independe de QUEM classifica).
  const classificados = grupos.map((g) => g.slice(0, classificadosPorGrupo))
  const confrontos = cruzarClassificados(classificados)

  // A chave começa após as rodadas de grupos (rodada-base contínua, D2).
  let fase = gerarFaseInicial(confrontos, idaEVolta, rodadasGrupos + 1)
  let jogosChave = fase.filter((p) => !p.bye).length
  let fasesChave = 1
  const todas: PartidaJogada[] = [...encerrarFase(fase)]
  for (;;) {
    const proxima = gerarProximaFase(todas, { idaEVolta, terceiroLugar })
    if (proxima.length === 0) break
    fasesChave++
    jogosChave += proxima.filter((p) => !p.bye).length
    fase = proxima
    todas.push(...encerrarFase(proxima))
  }

  return { jogosGrupos, rodadasGrupos, jogosChave, fasesChave }
}

describe("previaGrupos bate com a simulação dos motores", () => {
  const casos = [
    { n: 8, qtdGrupos: 2, classificadosPorGrupo: 2 },
    { n: 10, qtdGrupos: 2, classificadosPorGrupo: 4 },
    { n: 13, qtdGrupos: 4, classificadosPorGrupo: 2 },
    { n: 6, qtdGrupos: 1, classificadosPorGrupo: 4 },
  ]

  for (const { n, qtdGrupos, classificadosPorGrupo } of casos) {
    for (const idaEVolta of [false, true]) {
      for (const terceiroLugar of [false, true]) {
        it(`N=${n} G=${qtdGrupos} K=${classificadosPorGrupo} (idaEVolta=${idaEVolta}, terceiro=${terceiroLugar})`, () => {
          const sim = simular(n, qtdGrupos, classificadosPorGrupo, idaEVolta, terceiroLugar)
          const previa = previaGrupos(
            n,
            qtdGrupos,
            classificadosPorGrupo,
            idaEVolta,
            terceiroLugar
          )
          expect(previa).toEqual({
            jogosGrupos: sim.jogosGrupos,
            rodadasGrupos: sim.rodadasGrupos,
            jogosChave: sim.jogosChave,
            fasesChave: sim.fasesChave,
          })
        })
      }
    }
  }
})

describe("rotuloGrupo", () => {
  it("numera pela convenção do futebol (1 → Grupo A, 2 → Grupo B)", () => {
    expect(rotuloGrupo(1)).toBe("Grupo A")
    expect(rotuloGrupo(2)).toBe("Grupo B")
    expect(rotuloGrupo(4)).toBe("Grupo D")
  })
})
