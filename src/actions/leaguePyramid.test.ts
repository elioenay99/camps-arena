import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// getTournamentClassificacao é server-only e bate no banco — fora do escopo dos
// testes de lógica pura. As actions que o usam não são exercitadas aqui.
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: vi.fn(),
}))

import {
  atualizarIdaEVoltaDivisao,
  createCompetition,
  montarTemporada,
} from "@/actions/leaguePyramid"
import {
  calcularPlanoFluxo,
  calcularPromedio,
  combinarFronteiraBarragem,
  combinarFronteiraPlayoff,
  ordemSorteada,
  prngDeSemente,
  rankearPorPromedio,
  resolverZonaDeCorte,
  validarFechamentoTamanho,
  zonaBarragemPorPosicao,
  zonaPlayoffPorPosicao,
  type DivisaoFluxo,
  type FronteiraFluxo,
  type ItemPlanoFluxo,
  type LinhaFluxo,
} from "@/features/league/flowEngine"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

/** Gera ids legíveis e estáveis para os competidores nas asserções. */
const cid = (n: string) => `comp-${n}`

/**
 * Constrói uma divisão classificada com `n` competidores, posições 1..n SEM
 * empate (cada um na própria posição). Útil para fronteiras "limpas".
 */
function divisaoLimpa(nivel: number, n: number, prefixo = `d${nivel}`): DivisaoFluxo {
  const linhas: LinhaFluxo[] = []
  for (let i = 1; i <= n; i++) {
    linhas.push({
      competitorId: cid(`${prefixo}-${i}`),
      posicao: i,
      // Pontos decrescentes (10n .. 10): determinístico para PPG.
      pontos: (n - i + 1) * 10,
      jogos: 2 * (n - 1),
    })
  }
  return { nivel, linhas }
}

beforeEach(() => vi.clearAllMocks())

/* -------------------------------------------------------------------------- */
/* (c) Sorteio determinístico — mesma semente ⇒ mesma ordem                    */
/* -------------------------------------------------------------------------- */

describe("prngDeSemente / ordemSorteada (determinismo)", () => {
  it("a mesma semente produz a MESMA sequência de números", () => {
    const a = prngDeSemente("semente-x")
    const b = prngDeSemente("semente-x")
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it("sementes diferentes divergem (não é a função identidade)", () => {
    const a = prngDeSemente("semente-x")
    const b = prngDeSemente("semente-y")
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).not.toEqual(seqB)
  })

  it("ordemSorteada é estável para a mesma semente e é uma PERMUTAÇÃO", () => {
    const itens = ["a", "b", "c", "d", "e", "f", "g"]
    const um = ordemSorteada(itens, "seed-1")
    const dois = ordemSorteada(itens, "seed-1")
    expect(um).toEqual(dois)
    // Mesma multiset (permutação fiel, nada perdido/duplicado).
    expect([...um].sort()).toEqual([...itens].sort())
    // Não muta a entrada.
    expect(itens).toEqual(["a", "b", "c", "d", "e", "f", "g"])
  })

  it("sementes diferentes tendem a embaralhar diferente", () => {
    const itens = ["a", "b", "c", "d", "e", "f", "g", "h"]
    const um = ordemSorteada(itens, "seed-1")
    const dois = ordemSorteada(itens, "seed-2")
    expect(um).not.toEqual(dois)
  })
})

/* -------------------------------------------------------------------------- */
/* resolverZonaDeCorte — empate exato na linha de corte                        */
/* -------------------------------------------------------------------------- */

describe("resolverZonaDeCorte", () => {
  it("sem vagas: ninguém é escolhido", () => {
    const div = divisaoLimpa(1, 5)
    const r = resolverZonaDeCorte(div.linhas, 0, "bottom", "s")
    expect(r.escolhidos.size).toBe(0)
    expect(r.sorteados.size).toBe(0)
  })

  it("corte limpo (sem empate): escolhe os N primeiros/últimos, sem sorteio", () => {
    const div = divisaoLimpa(1, 5) // posições 1..5
    const topo = resolverZonaDeCorte(div.linhas, 2, "top", "s")
    expect([...topo.escolhidos].sort()).toEqual([cid("d1-1"), cid("d1-2")])
    expect(topo.sorteados.size).toBe(0)

    const fundo = resolverZonaDeCorte(div.linhas, 2, "bottom", "s")
    expect([...fundo.escolhidos].sort()).toEqual([cid("d1-4"), cid("d1-5")])
    expect(fundo.sorteados.size).toBe(0)
  })

  it("vagas >= tamanho: a zona engole a divisão inteira, sem sorteio", () => {
    const div = divisaoLimpa(1, 3)
    const r = resolverZonaDeCorte(div.linhas, 5, "top", "s")
    expect(r.escolhidos.size).toBe(3)
    expect(r.sorteados.size).toBe(0)
  })

  it("empate EXATO na linha de corte: sorteia entre os empatados, determinístico", () => {
    // 5 competidores; posições 1, 2, 2, 2, 5 (três empatados na posição 2).
    // 2 vagas no topo: o 1º entra direto; sobra 1 vaga para 3 empatados na pos 2.
    const linhas: LinhaFluxo[] = [
      { competitorId: cid("A"), posicao: 1, pontos: 30, jogos: 8 },
      { competitorId: cid("B"), posicao: 2, pontos: 20, jogos: 8 },
      { competitorId: cid("C"), posicao: 2, pontos: 20, jogos: 8 },
      { competitorId: cid("D"), posicao: 2, pontos: 20, jogos: 8 },
      { competitorId: cid("E"), posicao: 5, pontos: 5, jogos: 8 },
    ]
    const r = resolverZonaDeCorte(linhas, 2, "top", "fixo")
    // O 1º (posição 1) entra sempre.
    expect(r.escolhidos.has(cid("A"))).toBe(true)
    // Exatamente 2 escolhidos no total.
    expect(r.escolhidos.size).toBe(2)
    // TODOS os 3 empatados na posição de corte foram DECIDIDOS pelo sorteio
    // (1 levou a vaga, 2 perderam) — o grupo inteiro é marcado para habilitar o
    // override manual na UI.
    expect(r.sorteados.size).toBe(3)
    expect([...r.sorteados].sort()).toEqual([cid("B"), cid("C"), cid("D")])
    // Exatamente 1 dos empatados (além de A) ocupou a vaga restante.
    const escolhidoEmpate = [...r.escolhidos].filter((x) => x !== cid("A"))
    expect(escolhidoEmpate).toHaveLength(1)
    expect([cid("B"), cid("C"), cid("D")]).toContain(escolhidoEmpate[0])

    // Determinismo: a mesma semente reproduz a MESMA escolha.
    const r2 = resolverZonaDeCorte(linhas, 2, "top", "fixo")
    expect([...r2.escolhidos].sort()).toEqual([...r.escolhidos].sort())
    expect([...r2.sorteados].sort()).toEqual([...r.sorteados].sort())
  })

  it("NÃO marca 'sorteio' quando o grupo de empatados cabe EXATO nas vagas", () => {
    // bottom: posições 1,2,2,4,4 com 2 rebaixamentos — os dois pos-4 caem os
    // DOIS (cabem exatamente nas 2 vagas) → escolha por classificação, sem sorteio.
    const linhas: LinhaFluxo[] = [
      { competitorId: cid("A"), posicao: 1, pontos: 30, jogos: 8 },
      { competitorId: cid("B"), posicao: 2, pontos: 20, jogos: 8 },
      { competitorId: cid("C"), posicao: 2, pontos: 20, jogos: 8 },
      { competitorId: cid("D"), posicao: 4, pontos: 5, jogos: 8 },
      { competitorId: cid("E"), posicao: 4, pontos: 5, jogos: 8 },
    ]
    const fundo = resolverZonaDeCorte(linhas, 2, "bottom", "s")
    expect([...fundo.escolhidos].sort()).toEqual([cid("D"), cid("E")])
    expect(fundo.sorteados.size).toBe(0)

    // top: 1,1,3,4,5 com 2 acessos — os dois pos-1 sobem ambos, sem sorteio.
    const topoLinhas: LinhaFluxo[] = [
      { competitorId: cid("A"), posicao: 1, pontos: 30, jogos: 8 },
      { competitorId: cid("B"), posicao: 1, pontos: 30, jogos: 8 },
      { competitorId: cid("C"), posicao: 3, pontos: 10, jogos: 8 },
      { competitorId: cid("D"), posicao: 4, pontos: 5, jogos: 8 },
      { competitorId: cid("E"), posicao: 5, pontos: 1, jogos: 8 },
    ]
    const topo = resolverZonaDeCorte(topoLinhas, 2, "top", "s")
    expect([...topo.escolhidos].sort()).toEqual([cid("A"), cid("B")])
    expect(topo.sorteados.size).toBe(0)
  })
})

/* -------------------------------------------------------------------------- */
/* (a) Pirâmide de 3 divisões — conservação em fronteiras internas + pontas    */
/* -------------------------------------------------------------------------- */

describe("calcularPlanoFluxo + conservação (3 divisões)", () => {
  it("(a) 3 divisões 4-4-4, fronteiras simétricas 1/1: conserva tamanho em TODAS as fronteiras e nas pontas", () => {
    const divisoes = [divisaoLimpa(1, 4), divisaoLimpa(2, 4), divisaoLimpa(3, 4)]
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
      { nivelSuperior: 2, vagasAcesso: 1, vagasRebaixamento: 1 },
    ]
    const plano = calcularPlanoFluxo(divisoes, fronteiras, "seed")

    // Ponta superior (divisão 1): NINGUÉM sobe (não há fronteira com nível 0);
    // o último cai para a 2.
    const div1 = plano.itens.filter((i) => i.nivelOrigem === 1)
    expect(div1.filter((i) => i.destino === "sobe")).toHaveLength(0)
    expect(div1.filter((i) => i.destino === "cai")).toHaveLength(1)
    // O 4º (último) cai.
    expect(div1.find((i) => i.destino === "cai")?.posicaoFinal).toBe(4)

    // Divisão do meio: 1 sobe (1º) + 1 cai (4º).
    const div2 = plano.itens.filter((i) => i.nivelOrigem === 2)
    expect(div2.filter((i) => i.destino === "sobe")).toHaveLength(1)
    expect(div2.filter((i) => i.destino === "cai")).toHaveLength(1)
    expect(div2.find((i) => i.destino === "sobe")?.posicaoFinal).toBe(1)
    expect(div2.find((i) => i.destino === "cai")?.posicaoFinal).toBe(4)

    // Ponta inferior (divisão 3): NINGUÉM cai; o 1º sobe.
    const div3 = plano.itens.filter((i) => i.nivelOrigem === 3)
    expect(div3.filter((i) => i.destino === "cai")).toHaveLength(0)
    expect(div3.filter((i) => i.destino === "sobe")).toHaveLength(1)
    expect(div3.find((i) => i.destino === "sobe")?.posicaoFinal).toBe(1)

    // CONSERVAÇÃO: cada divisão da N+1 fecha com o MESMO tamanho (4).
    const fechamento = validarFechamentoTamanho(plano.itens)
    expect(fechamento.ok).toBe(true)
    if (fechamento.ok) {
      expect(fechamento.tamanhos.get(1)).toBe(4)
      expect(fechamento.tamanhos.get(2)).toBe(4)
      expect(fechamento.tamanhos.get(3)).toBe(4)
    }

    // Cada competidor aparece EXATAMENTE uma vez no plano (12 competidores).
    expect(plano.itens).toHaveLength(12)
    const ids = new Set(plano.itens.map((i) => i.competitorId))
    expect(ids.size).toBe(12)
  })

  it("(d) fronteira simétrica conserva mesmo com tamanhos diferentes (6 e 4, 2/2)", () => {
    const divisoes = [divisaoLimpa(1, 6), divisaoLimpa(2, 4)]
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 2, vagasRebaixamento: 2 },
    ]
    const plano = calcularPlanoFluxo(divisoes, fronteiras, "seed")
    const fechamento = validarFechamentoTamanho(plano.itens)
    expect(fechamento.ok).toBe(true)
    if (fechamento.ok) {
      // 6 - 2 (caem) + 2 (sobem) = 6; 4 - 2 + 2 = 4.
      expect(fechamento.tamanhos.get(1)).toBe(6)
      expect(fechamento.tamanhos.get(2)).toBe(4)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* (b) Config <2 após fluxo é REJEITADA antes de escrever                       */
/* -------------------------------------------------------------------------- */

describe("validarFechamentoTamanho (rejeição)", () => {
  it("(b) divisão que ficaria com 1 competidor é REJEITADA (fora de [2,20])", () => {
    // Divisão de destino nível 2 com só 1 entrante.
    const itens: ItemPlanoFluxo[] = [
      {
        competitorId: cid("solo"),
        nivelOrigem: 2,
        nivelDestino: 2,
        posicaoFinal: 1,
        pontos: 10,
        jogos: 2,
        destino: "permanece",
        resolvidoPor: "classificacao",
      },
    ]
    const r = validarFechamentoTamanho(itens)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.nivel).toBe(2)
      expect(r.tamanho).toBe(1)
    }
  })

  it("divisão que estouraria 20 é REJEITADA", () => {
    const itens: ItemPlanoFluxo[] = Array.from({ length: 21 }, (_, i) => ({
      competitorId: cid(`x${i}`),
      nivelOrigem: 1,
      nivelDestino: 1,
      posicaoFinal: i + 1,
      pontos: 1,
      jogos: 1,
      destino: "permanece" as const,
      resolvidoPor: "classificacao" as const,
    }))
    const r = validarFechamentoTamanho(itens)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.nivel).toBe(1)
      expect(r.tamanho).toBe(21)
    }
  })

  it("exatamente 2 e exatamente 20 são ACEITOS (pontas do intervalo)", () => {
    const dois: ItemPlanoFluxo[] = [1, 2].map((i) => ({
      competitorId: cid(`a${i}`),
      nivelOrigem: 1,
      nivelDestino: 1,
      posicaoFinal: i,
      pontos: 1,
      jogos: 1,
      destino: "permanece",
      resolvidoPor: "classificacao",
    }))
    expect(validarFechamentoTamanho(dois).ok).toBe(true)

    const vinte: ItemPlanoFluxo[] = Array.from({ length: 20 }, (_, i) => ({
      competitorId: cid(`b${i}`),
      nivelOrigem: 1,
      nivelDestino: 1,
      posicaoFinal: i + 1,
      pontos: 1,
      jogos: 1,
      destino: "permanece" as const,
      resolvidoPor: "classificacao" as const,
    }))
    expect(validarFechamentoTamanho(vinte).ok).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* (e) N=1 — uma divisão, sem fronteiras                                        */
/* -------------------------------------------------------------------------- */

describe("calcularPlanoFluxo (N=1, sem fronteiras)", () => {
  it("(e) pirâmide de 1 divisão: todos PERMANECEM e o tamanho é conservado", () => {
    const divisoes = [divisaoLimpa(1, 8)]
    const plano = calcularPlanoFluxo(divisoes, [], "seed")
    expect(plano.itens).toHaveLength(8)
    expect(plano.itens.every((i) => i.destino === "permanece")).toBe(true)
    expect(plano.itens.every((i) => i.nivelDestino === 1)).toBe(true)
    expect(plano.itens.every((i) => i.resolvidoPor === "classificacao")).toBe(true)

    const fechamento = validarFechamentoTamanho(plano.itens)
    expect(fechamento.ok).toBe(true)
    if (fechamento.ok) expect(fechamento.tamanhos.get(1)).toBe(8)
  })
})

/* -------------------------------------------------------------------------- */
/* (c-bis) Plano com sorteio na fronteira: determinístico por semente           */
/* -------------------------------------------------------------------------- */

describe("calcularPlanoFluxo (sorteio na fronteira, determinístico)", () => {
  it("empate exato na zona de rebaixamento marca resolvido_por='sorteio' e é estável", () => {
    // Divisão 1 com empate na zona de rebaixamento: posições 1, 2, 3, 3 (os dois
    // últimos empatados na 3). 1 vaga de rebaixamento → sorteia entre os 2.
    const div1: DivisaoFluxo = {
      nivel: 1,
      linhas: [
        { competitorId: cid("A"), posicao: 1, pontos: 30, jogos: 6 },
        { competitorId: cid("B"), posicao: 2, pontos: 20, jogos: 6 },
        { competitorId: cid("C"), posicao: 3, pontos: 10, jogos: 6 },
        { competitorId: cid("D"), posicao: 3, pontos: 10, jogos: 6 },
      ],
    }
    const div2 = divisaoLimpa(2, 4)
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
    ]

    const plano = calcularPlanoFluxo([div1, div2], fronteiras, "seed-fixa")
    const caem = plano.itens.filter((i) => i.nivelOrigem === 1 && i.destino === "cai")
    expect(caem).toHaveLength(1)
    // Quem caiu foi por SORTEIO (empate na linha de corte) — corte de rebaixamento.
    expect(caem[0].resolvidoPor).toBe("sorteio")
    expect(caem[0].cortePonta).toBe("cai")
    expect([cid("C"), cid("D")]).toContain(caem[0].competitorId)
    // O co-empatado que SOBREVIVEU à queda também é 'sorteio' (disputou e ficou)
    // — é ele que o dono pode promover a 'cai' no override.
    const sobrevivente = plano.itens.find(
      (i) =>
        i.nivelOrigem === 1 &&
        i.destino === "permanece" &&
        (i.competitorId === cid("C") || i.competitorId === cid("D"))
    )
    expect(sobrevivente?.resolvidoPor).toBe("sorteio")
    expect(sobrevivente?.cortePonta).toBe("cai")
    // A vitória da divisão 1 (A) e o vice (B), fora do empate, permanecem por
    // classificação.
    const naoEmpatados = plano.itens.filter(
      (i) =>
        i.nivelOrigem === 1 &&
        (i.competitorId === cid("A") || i.competitorId === cid("B"))
    )
    expect(naoEmpatados.every((i) => i.resolvidoPor === "classificacao")).toBe(true)

    // Determinismo: mesma semente ⇒ mesmo competidor rebaixado.
    const plano2 = calcularPlanoFluxo([div1, div2], fronteiras, "seed-fixa")
    const caem2 = plano2.itens.filter(
      (i) => i.nivelOrigem === 1 && i.destino === "cai"
    )
    expect(caem2[0].competitorId).toBe(caem[0].competitorId)

    // Conservação preservada mesmo com sorteio.
    expect(validarFechamentoTamanho(plano.itens).ok).toBe(true)
  })

  it("(B2) divisão do meio com sorteio no acesso E no rebaixamento: cortePonta distingue", () => {
    const div1 = divisaoLimpa(1, 4)
    const div2: DivisaoFluxo = {
      nivel: 2,
      linhas: [
        { competitorId: cid("M1"), posicao: 1, pontos: 30, jogos: 10 },
        { competitorId: cid("M2"), posicao: 1, pontos: 30, jogos: 10 },
        { competitorId: cid("M3"), posicao: 3, pontos: 20, jogos: 10 },
        { competitorId: cid("M4"), posicao: 4, pontos: 15, jogos: 10 },
        { competitorId: cid("M5"), posicao: 5, pontos: 5, jogos: 10 },
        { competitorId: cid("M6"), posicao: 5, pontos: 5, jogos: 10 },
      ],
    }
    const div3 = divisaoLimpa(3, 4)
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 0 },
      { nivelSuperior: 2, vagasAcesso: 0, vagasRebaixamento: 1 },
    ]
    const plano = calcularPlanoFluxo([div1, div2, div3], fronteiras, "seed-b2")
    const item = (id: string) =>
      plano.itens.find((i) => i.competitorId === cid(id))!

    // Corte de ACESSO (M1/M2): um sobe, um permanece — ambos cortePonta 'sobe'.
    const acesso = [item("M1"), item("M2")]
    expect(
      acesso.every((i) => i.resolvidoPor === "sorteio" && i.cortePonta === "sobe")
    ).toBe(true)
    expect(acesso.filter((i) => i.destino === "sobe")).toHaveLength(1)
    expect(acesso.filter((i) => i.destino === "permanece")).toHaveLength(1)

    // Corte de REBAIXAMENTO (M5/M6): um cai, um permanece — ambos cortePonta 'cai'.
    const rebaix = [item("M5"), item("M6")]
    expect(
      rebaix.every((i) => i.resolvidoPor === "sorteio" && i.cortePonta === "cai")
    ).toBe(true)
    expect(rebaix.filter((i) => i.destino === "cai")).toHaveLength(1)
    expect(rebaix.filter((i) => i.destino === "permanece")).toHaveLength(1)

    // O miolo (M3, M4) permanece por classificação, sem corte.
    expect(item("M3").resolvidoPor).toBe("classificacao")
    expect(item("M3").cortePonta).toBeUndefined()
    expect(item("M4").resolvidoPor).toBe("classificacao")
  })

  it("(straddle) meio com 3 empatados e fronteiras 1/1: 1 sobe + 1 cai + 1 permanece; cortePonta segue o destino", () => {
    const div2: DivisaoFluxo = {
      nivel: 2,
      linhas: [
        { competitorId: cid("M1"), posicao: 1, pontos: 10, jogos: 4 },
        { competitorId: cid("M2"), posicao: 1, pontos: 10, jogos: 4 },
        { competitorId: cid("M3"), posicao: 1, pontos: 10, jogos: 4 },
      ],
    }
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
      { nivelSuperior: 2, vagasAcesso: 1, vagasRebaixamento: 1 },
    ]
    const plano = calcularPlanoFluxo(
      [divisaoLimpa(1, 4), div2, divisaoLimpa(3, 4)],
      fronteiras,
      "seed-straddle"
    )
    const meio = plano.itens.filter((i) => i.nivelOrigem === 2)
    // DISJUNTOS: exatamente 1 sobe, 1 cai, 1 permanece (ninguém sobe E cai).
    expect(meio.filter((i) => i.destino === "sobe")).toHaveLength(1)
    expect(meio.filter((i) => i.destino === "cai")).toHaveLength(1)
    expect(meio.filter((i) => i.destino === "permanece")).toHaveLength(1)
    // cortePonta segue o destino realizado (não o conjunto de sorteados).
    expect(meio.find((i) => i.destino === "sobe")?.cortePonta).toBe("sobe")
    expect(meio.find((i) => i.destino === "cai")?.cortePonta).toBe("cai")
    // Conservação intacta (o backstop [2,20] não rejeitaria, mas confirmamos).
    expect(validarFechamentoTamanho(plano.itens).ok).toBe(true)
  })

  it("(disjunção) meio de tamanho 2 empatado com fronteiras 1/1: 1 sobe + 1 cai, sem colapso da vaga de acesso", () => {
    const div2: DivisaoFluxo = {
      nivel: 2,
      linhas: [
        { competitorId: cid("N1"), posicao: 1, pontos: 10, jogos: 2 },
        { competitorId: cid("N2"), posicao: 1, pontos: 10, jogos: 2 },
      ],
    }
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
      { nivelSuperior: 2, vagasAcesso: 1, vagasRebaixamento: 1 },
    ]
    // Varre 80 sementes: a disjunção é ESTRUTURAL (o caído é excluído do acesso),
    // então NENHUMA semente pode produzir sobreposição/colapso — antes do fix,
    // ~52% das sementes corrompiam (1 sobe virava 0).
    for (let i = 0; i < 80; i++) {
      const plano = calcularPlanoFluxo(
        [divisaoLimpa(1, 4), div2, divisaoLimpa(3, 4)],
        fronteiras,
        `seed-size2-${i}`
      )
      const meio = plano.itens.filter((it) => it.nivelOrigem === 2)
      expect(meio.filter((it) => it.destino === "sobe")).toHaveLength(1)
      expect(meio.filter((it) => it.destino === "cai")).toHaveLength(1)
      const f = validarFechamentoTamanho(plano.itens)
      expect(f.ok).toBe(true)
      // Nenhum competidor sobe E cai (destinos mutuamente exclusivos por item).
      const subiu = new Set(meio.filter((it) => it.destino === "sobe").map((it) => it.competitorId))
      const caiu = meio.filter((it) => it.destino === "cai").map((it) => it.competitorId)
      expect(caiu.some((id) => subiu.has(id))).toBe(false)
    }
  })

  it("(straddle, varredura) meio com 3 empatados e fronteiras 1/1 nunca gera cortePonta incoerente com o destino", () => {
    const div2: DivisaoFluxo = {
      nivel: 2,
      linhas: [
        { competitorId: cid("M1"), posicao: 1, pontos: 10, jogos: 4 },
        { competitorId: cid("M2"), posicao: 1, pontos: 10, jogos: 4 },
        { competitorId: cid("M3"), posicao: 1, pontos: 10, jogos: 4 },
      ],
    }
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
      { nivelSuperior: 2, vagasAcesso: 1, vagasRebaixamento: 1 },
    ]
    for (let i = 0; i < 80; i++) {
      const plano = calcularPlanoFluxo(
        [divisaoLimpa(1, 4), div2, divisaoLimpa(3, 4)],
        fronteiras,
        `seed-straddle-${i}`
      )
      const meio = plano.itens.filter((it) => it.nivelOrigem === 2)
      expect(meio.filter((it) => it.destino === "sobe")).toHaveLength(1)
      expect(meio.filter((it) => it.destino === "cai")).toHaveLength(1)
      // cortePonta NUNCA contradiz o destino de quem ganhou a vaga (raiz do
      // dead-end): quem sobe é 'sobe', quem cai é 'cai'.
      for (const it of meio) {
        if (it.destino === "sobe") expect(it.cortePonta).toBe("sobe")
        if (it.destino === "cai") expect(it.cortePonta).toBe("cai")
      }
    }
  })
})

/* -------------------------------------------------------------------------- */
/* (f) Degradação user_id→NULL é da RPC — documentada; testável o limite TS     */
/* -------------------------------------------------------------------------- */

describe("(f) degradação holder_user_id → NULL (responsabilidade da RPC)", () => {
  /**
   * A degradação do `user_id` quando dois competidores da MESMA divisão têm o
   * mesmo `holder_user_id` acontece DENTRO da RPC `montar_temporada`
   * (SECURITY DEFINER, supabase/schema.sql §montar_temporada, passo 5): ela
   * acumula `v_holders_usados` e grava `user_id = NULL` na vaga em conflito,
   * evitando o 23505 do índice `slots_um_clube_por_tecnico`. Em TS, a action
   * `montarTemporada` é fina e só repassa/mapeia erros — não há lógica de
   * degradação a testar no lado do servidor Node. Documentamos o invariante e
   * cobrimos o que É testável: a action não inventa erro quando a RPC tem
   * sucesso (a degradação é transparente para a action).
   */
  it("montarTemporada repassa sucesso da RPC sem reportar erro (degradação é transparente)", async () => {
    const rpcSpy = vi.fn(async () => ({ data: null, error: null }))
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
          error: null,
        })),
      },
      rpc: rpcSpy,
    } as unknown as never)

    const r = await montarTemporada("11111111-1111-4111-8111-111111111111")
    expect(r).toEqual({ ok: true })
    expect(rpcSpy).toHaveBeenCalledWith("montar_temporada", {
      p_season_id: "11111111-1111-4111-8111-111111111111",
    })
  })
})

/* -------------------------------------------------------------------------- */
/* montarTemporada — mapeamento de erros da RPC para pt-BR                       */
/* -------------------------------------------------------------------------- */

describe("montarTemporada (action thin sobre a RPC)", () => {
  function clientComRpc(opts: {
    user?: { id: string } | null
    rpcError?: { message?: string; code?: string } | null
  }) {
    const rpcSpy = vi.fn(async () => ({
      data: null,
      error: opts.rpcError ?? null,
    }))
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: opts.user === undefined ? { id: "dono" } : opts.user },
          error: null,
        })),
      },
      rpc: rpcSpy,
    } as unknown as never)
    return rpcSpy
  }

  it("id inválido rejeita sem tocar o banco", async () => {
    const r = await montarTemporada("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Temporada inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem chamar a RPC", async () => {
    const rpcSpy = clientComRpc({ user: null })
    const r = await montarTemporada("11111111-1111-4111-8111-111111111111")
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("NAO_DONO vira mensagem de posse em pt-BR", async () => {
    clientComRpc({ rpcError: { message: "NAO_DONO" } })
    const r = await montarTemporada("11111111-1111-4111-8111-111111111111")
    expect(r).toEqual({ ok: false, error: "Você não é o dono desta liga." })
  })

  it("DIVISAO_SEM_COMPETIDORES_SUFICIENTES vira mensagem clara", async () => {
    clientComRpc({ rpcError: { message: "DIVISAO_SEM_COMPETIDORES_SUFICIENTES" } })
    const r = await montarTemporada("11111111-1111-4111-8111-111111111111")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/menos de 2 competidores/i)
  })

  it("erro desconhecido vira mensagem genérica (sem vazar detalhe)", async () => {
    clientComRpc({ rpcError: { message: "alguma falha interna do postgres xyz" } })
    const r = await montarTemporada("11111111-1111-4111-8111-111111111111")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível montar/i)
  })
})

describe("atualizarIdaEVoltaDivisao (action thin sobre a RPC)", () => {
  const DIV = "22222222-2222-4222-8222-222222222222"
  const SEASON = "33333333-3333-4333-8333-333333333333"

  function clientComRpc(opts: {
    user?: { id: string } | null
    rpcError?: { message?: string } | null
  }) {
    const rpcSpy = vi.fn(async () => ({ data: null, error: opts.rpcError ?? null }))
    mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: opts.user === undefined ? { id: "dono" } : opts.user },
          error: null,
        })),
      },
      rpc: rpcSpy,
    } as unknown as never)
    return rpcSpy
  }

  const entrada = (over: Record<string, unknown> = {}) => ({
    divisionSeasonId: DIV,
    seasonId: SEASON,
    idaEVolta: true,
    ...over,
  })

  it("input inválido rejeita sem tocar o banco", async () => {
    const r = await atualizarIdaEVoltaDivisao(entrada({ divisionSeasonId: "nao-uuid" }))
    expect(r).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("idaEVolta não-booleano rejeita sem tocar o banco", async () => {
    const r = await atualizarIdaEVoltaDivisao(entrada({ idaEVolta: "sim" }))
    expect(r.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem chamar a RPC", async () => {
    const rpcSpy = clientComRpc({ user: null })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("sucesso chama a RPC com os args certos e retorna ok", async () => {
    const rpcSpy = clientComRpc({})
    const r = await atualizarIdaEVoltaDivisao(entrada({ idaEVolta: true }))
    expect(r).toEqual({ ok: true })
    expect(rpcSpy).toHaveBeenCalledWith("atualizar_ida_e_volta_divisao", {
      p_division_season_id: DIV,
      p_ida_e_volta: true,
    })
  })

  it("NAO_AUTORIZADO vira mensagem de permissão (cross-tenant/sem capacidade)", async () => {
    clientComRpc({ rpcError: { message: "NAO_AUTORIZADO" } })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/permissão/i)
  })

  it("FORMATO_INVALIDO vira mensagem de só-liga", async () => {
    clientComRpc({ rpcError: { message: "FORMATO_INVALIDO" } })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/só divisões de liga/i)
  })

  it("JA_INICIADA vira mensagem de turno congelado", async () => {
    clientComRpc({ rpcError: { message: "JA_INICIADA" } })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já foi iniciada/i)
  })

  it("JA_TEM_RODADAS vira mensagem de rodadas geradas", async () => {
    clientComRpc({ rpcError: { message: "JA_TEM_RODADAS" } })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já tem rodadas/i)
  })

  it("erro desconhecido vira mensagem genérica (sem vazar detalhe)", async () => {
    clientComRpc({ rpcError: { message: "boom interno xyz" } })
    const r = await atualizarIdaEVoltaDivisao(entrada())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível alterar o turno/i)
  })
})

/* -------------------------------------------------------------------------- */
/* createCompetition — validação Zod barra config inconsistente, sem escrever   */
/* -------------------------------------------------------------------------- */

describe("createCompetition (validação)", () => {
  it("config inválida (divisão sem competidores) é REJEITADA com fieldErrors, sem tocar o banco", async () => {
    const r = await createCompetition({
      nome: "Minha Liga",
      isPublic: true,
      divisoes: [
        {
          nivel: 1,
          nome: "Série A",
          porNome: true,
          desempate: "cbf",
          tamanho: 4,
          competidores: [], // 0 != tamanho 4 → refine rejeita
        },
      ],
      fronteiras: [],
    } as never)
    expect(r.error).toBeDefined()
    expect(r.fieldErrors).toBeDefined()
    // Não chegou a abrir o cliente (validação antes do banco).
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("config que estoura a conservação de tamanho é REJEITADA antes de escrever", async () => {
    // 1 divisão de tamanho 2, fronteira tirando 1 sem repor → ficaria com 1.
    const r = await createCompetition({
      nome: "Liga Quebrada",
      isPublic: true,
      divisoes: [
        {
          nivel: 1,
          nome: "Única",
          porNome: true,
          desempate: "cbf",
          tamanho: 2,
          competidores: [{ rotulo: "Alpha" }, { rotulo: "Beta" }],
        },
        {
          nivel: 2,
          nome: "Segunda",
          porNome: true,
          desempate: "cbf",
          tamanho: 2,
          competidores: [{ rotulo: "Gama" }, { rotulo: "Delta" }],
        },
      ],
      // Cai 1 da divisão 1 mas sobem 0 → divisão 1 fica com 1 (< 2): REJEITADA.
      fronteiras: [
        { nivelSuperior: 1, vagasAcesso: 0, vagasRebaixamento: 1, modo: "direto" },
      ],
    } as never)
    expect(r.error).toBeDefined()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })
})

/* -------------------------------------------------------------------------- */
/* Fase 2 — fronteiras de PLAYOFF no motor de fluxo                             */
/* -------------------------------------------------------------------------- */

describe("calcularPlanoFluxo (mover DIRETO limpo = classificacao)", () => {
  it("swap simétrico sem empate: movers são 'classificacao', sem cortePonta", () => {
    const fronteiras: FronteiraFluxo[] = [
      { nivelSuperior: 1, vagasAcesso: 2, vagasRebaixamento: 2 },
    ]
    const plano = calcularPlanoFluxo(
      [divisaoLimpa(1, 4), divisaoLimpa(2, 4)],
      fronteiras,
      "limpo"
    )
    const movers = plano.itens.filter((i) => i.destino !== "permanece")
    expect(movers.length).toBe(4) // 2 sobem + 2 caem
    expect(movers.every((i) => i.resolvidoPor === "classificacao")).toBe(true)
    expect(movers.every((i) => i.cortePonta === undefined)).toBe(true)
  })
})

describe("calcularPlanoFluxo (fronteira de playoff)", () => {
  it("playoff_acesso: chave decide o acesso (resolvido='playoff'); queda direta='classificacao'", () => {
    // div1 size 6 (rebaixa 4 diretos), div2 size 8 (4 sobem pela chave).
    const div1 = divisaoLimpa(1, 6)
    const div2 = divisaoLimpa(2, 8)
    const sobePelaChave = new Set([
      cid("d2-1"),
      cid("d2-2"),
      cid("d2-3"),
      cid("d2-4"),
    ])
    const quedaDireta = new Set([
      cid("d1-3"),
      cid("d1-4"),
      cid("d1-5"),
      cid("d1-6"),
    ])
    const fronteiras: FronteiraFluxo[] = [
      {
        nivelSuperior: 1,
        vagasAcesso: 4,
        vagasRebaixamento: 4,
        playoff: {
          sobem: sobePelaChave,
          caem: quedaDireta,
          sobemPorChave: sobePelaChave,
          caemPorChave: new Set(), // queda foi DIRETA por posição
        },
      },
    ]
    const plano = calcularPlanoFluxo([div1, div2], fronteiras, "po-acesso")
    const sobem = plano.itens.filter((i) => i.destino === "sobe")
    expect(sobem.map((i) => i.competitorId).sort()).toEqual(
      [...sobePelaChave].sort()
    )
    expect(sobem.every((i) => i.resolvidoPor === "playoff")).toBe(true)
    const caem = plano.itens.filter((i) => i.destino === "cai")
    expect(caem.map((i) => i.competitorId).sort()).toEqual([...quedaDireta].sort())
    // Queda direta = classificacao (não jogou playoff).
    expect(caem.every((i) => i.resolvidoPor === "classificacao")).toBe(true)
    // Cobertura total + conservação.
    expect(plano.itens.length).toBe(14)
    const f = validarFechamentoTamanho(plano.itens)
    expect(f.ok).toBe(true)
    if (f.ok) {
      expect(f.tamanhos.get(1)).toBe(6)
      expect(f.tamanhos.get(2)).toBe(8)
    }
  })

  it("playout extra: 1 queda direta + 1 perdedor da chave; acesso direto da inferior", () => {
    const div1 = divisaoLimpa(1, 6)
    const div2 = divisaoLimpa(2, 6)
    const quedaChave = new Set([cid("d1-3")]) // perdedor da final
    const caemTotal = new Set([cid("d1-6"), cid("d1-3")]) // 1 direto + 1 chave
    const sobeDireto = new Set([cid("d2-1"), cid("d2-2")]) // acesso direto (vr+1=2)
    const fronteiras: FronteiraFluxo[] = [
      {
        nivelSuperior: 1,
        vagasAcesso: 2,
        vagasRebaixamento: 1,
        playoff: {
          sobem: sobeDireto,
          caem: caemTotal,
          sobemPorChave: new Set(), // acesso da inferior é DIRETO num playout
          caemPorChave: quedaChave,
        },
      },
    ]
    const plano = calcularPlanoFluxo([div1, div2], fronteiras, "po-out")
    const item = (id: string) => plano.itens.find((i) => i.competitorId === cid(id))!
    expect(item("d1-6").destino).toBe("cai")
    expect(item("d1-6").resolvidoPor).toBe("classificacao") // direto
    expect(item("d1-3").destino).toBe("cai")
    expect(item("d1-3").resolvidoPor).toBe("playoff") // perdeu a chave
    expect(item("d2-1").destino).toBe("sobe")
    expect(item("d2-1").resolvidoPor).toBe("classificacao") // acesso direto
    // Conservação 6→6 em ambas.
    const f = validarFechamentoTamanho(plano.itens)
    expect(f.ok).toBe(true)
    if (f.ok) {
      expect(f.tamanhos.get(1)).toBe(6)
      expect(f.tamanhos.get(2)).toBe(6)
    }
  })

  it("DISJUNÇÃO misto direto+playout: quem cai pela chave NÃO pode subir pelo direto", () => {
    // div2 (meio) é INFERIOR da fronteira 1↔2 (direto, acesso 1) e SUPERIOR da
    // 2↔3 (playout). O top de div2 cai pela chave do playout → não pode subir.
    const div1 = divisaoLimpa(1, 4)
    const div2 = divisaoLimpa(2, 4)
    const div3 = divisaoLimpa(3, 4)
    const caiPelaChave = new Set([cid("d2-1")]) // o 1º de div2 perdeu o playout
    const fronteiras: FronteiraFluxo[] = [
      // 1↔2 direto: 1 sobe de div2 / 1 cai de div1.
      { nivelSuperior: 1, vagasAcesso: 1, vagasRebaixamento: 1 },
      // 2↔3 playout: 1 cai de div2 pela chave / 1 sobe de div3 direto.
      {
        nivelSuperior: 2,
        vagasAcesso: 1,
        vagasRebaixamento: 1,
        playoff: {
          sobem: new Set([cid("d3-1")]),
          caem: caiPelaChave,
          sobemPorChave: new Set(),
          caemPorChave: caiPelaChave,
        },
      },
    ]
    const plano = calcularPlanoFluxo([div1, div2, div3], fronteiras, "misto")
    const d2_1 = plano.itens.find((i) => i.competitorId === cid("d2-1"))!
    // d2-1 CAI pela chave; NÃO sobe (disjunção: rebaixa primeiro).
    expect(d2_1.destino).toBe("cai")
    expect(d2_1.resolvidoPor).toBe("playoff")
    // A vaga de acesso da 1↔2 foi para o PRÓXIMO elegível (d2-2), não sumiu.
    const sobeDeMeio = plano.itens.filter(
      (i) => i.nivelOrigem === 2 && i.destino === "sobe"
    )
    expect(sobeDeMeio).toHaveLength(1)
    expect(sobeDeMeio[0].competitorId).toBe(cid("d2-2"))
    // Ninguém sobe E cai; cobertura total preservada.
    expect(plano.itens.length).toBe(12)
    expect(validarFechamentoTamanho(plano.itens).ok).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Fase 2 — zona da chave + combinação (helpers puros)                          */
/* -------------------------------------------------------------------------- */

describe("zonaPlayoffPorPosicao", () => {
  // Classificação best-first: posicao 1..n.
  const ord = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ competitorId: cid(`p${i + 1}`), posicao: i + 1 }))

  it("playoff_acesso 'vagas': os playoffVagas PRIMEIROS da inferior", () => {
    const z = zonaPlayoffPorPosicao({
      modo: "playoff_acesso",
      estilo: "vagas",
      vagasAcesso: 4,
      vagasRebaixamento: 4,
      playoffVagas: 8,
      ordenada: ord(8),
    })
    expect(z).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => cid(`p${i}`)))
  })

  it("playoff_acesso 'extra': pula os diretos, pega os playoffVagas seguintes", () => {
    const z = zonaPlayoffPorPosicao({
      modo: "playoff_acesso",
      estilo: "extra",
      vagasAcesso: 2,
      vagasRebaixamento: 3,
      playoffVagas: 4,
      ordenada: ord(8),
    })
    // posições 3,4,5,6 (0-indexed 2..5).
    expect(z).toEqual([3, 4, 5, 6].map((i) => cid(`p${i}`)))
  })

  it("playout 'vagas': os playoffVagas ÚLTIMOS da superior, best-first", () => {
    const z = zonaPlayoffPorPosicao({
      modo: "playout",
      estilo: "vagas",
      vagasAcesso: 4,
      vagasRebaixamento: 4,
      playoffVagas: 8,
      ordenada: ord(8),
    })
    expect(z).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => cid(`p${i}`)))
  })

  it("playout 'extra': pula o rebaixamento direto do fundo, pega os playoffVagas acima", () => {
    const z = zonaPlayoffPorPosicao({
      modo: "playout",
      estilo: "extra",
      vagasAcesso: 2,
      vagasRebaixamento: 1,
      playoffVagas: 4,
      ordenada: ord(8),
    })
    // end = 8 - 1 = 7; start = 7 - 4 = 3 ⇒ posições 4,5,6,7.
    expect(z).toEqual([4, 5, 6, 7].map((i) => cid(`p${i}`)))
  })
})

describe("combinarFronteiraPlayoff", () => {
  const ord = (prefixo: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      competitorId: cid(`${prefixo}${i + 1}`),
      posicao: i + 1,
    }))

  it("playoff_acesso 'vagas': sobem=chave, caem=fundo direto da superior", () => {
    const chaveSobem = new Set([cid("inf1"), cid("inf2")])
    const r = combinarFronteiraPlayoff({
      modo: "playoff_acesso",
      estilo: "vagas",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      superiorOrdenada: ord("sup", 6),
      inferiorOrdenada: ord("inf", 8),
      chaveSobem,
      chaveCaem: new Set(),
    })
    expect([...r.sobem].sort()).toEqual([cid("inf1"), cid("inf2")].sort())
    expect([...r.sobemPorChave].sort()).toEqual([cid("inf1"), cid("inf2")].sort())
    // queda direta = 2 últimos da superior (pos 5,6).
    expect([...r.caem].sort()).toEqual([cid("sup5"), cid("sup6")].sort())
    expect(r.caemPorChave.size).toBe(0)
  })

  it("playoff_acesso 'extra': sobem=2 diretos + campeão (porChave só o campeão)", () => {
    const r = combinarFronteiraPlayoff({
      modo: "playoff_acesso",
      estilo: "extra",
      vagasAcesso: 2,
      vagasRebaixamento: 3,
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
      chaveSobem: new Set([cid("inf5")]), // campeão da chave (zona 3..6)
      chaveCaem: new Set(),
    })
    expect([...r.sobem].sort()).toEqual([cid("inf1"), cid("inf2"), cid("inf5")].sort())
    expect([...r.sobemPorChave]).toEqual([cid("inf5")]) // só o campeão é 'playoff'
    expect([...r.caem].sort()).toEqual(
      [cid("sup6"), cid("sup7"), cid("sup8")].sort()
    ) // 3 diretos
    expect(r.caemPorChave.size).toBe(0)
  })

  it("playout 'extra': caem=1 direto + perdedor da final; acesso direto da inferior", () => {
    const r = combinarFronteiraPlayoff({
      modo: "playout",
      estilo: "extra",
      vagasAcesso: 2,
      vagasRebaixamento: 1,
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
      chaveSobem: new Set(),
      chaveCaem: new Set([cid("sup4")]), // perdedor da final (zona 4..7)
    })
    expect([...r.caem].sort()).toEqual([cid("sup8"), cid("sup4")].sort())
    expect([...r.caemPorChave]).toEqual([cid("sup4")]) // só o perdedor é 'playoff'
    expect([...r.sobem].sort()).toEqual([cid("inf1"), cid("inf2")].sort())
    expect(r.sobemPorChave.size).toBe(0)
  })
})

describe("zonaBarragemPorPosicao (Fase 3)", () => {
  const ord = (prefixo: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      competitorId: cid(`${prefixo}${i + 1}`),
      posicao: i + 1,
    }))

  it("pares: B logo acima dos R diretos (sup) × B logo abaixo dos A diretos (inf)", () => {
    const z = zonaBarragemPorPosicao({
      estilo: "pares",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      playoffVagas: 4, // B=2
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
    })
    expect(z).not.toBeNull()
    // zona de risco da superior = sup5,sup6 (acima dos rebaixados sup7,sup8)
    expect([...z!.deSuperior].sort()).toEqual([cid("sup5"), cid("sup6")].sort())
    // zona de disputa da inferior = inf3,inf4 (abaixo dos promovidos inf1,inf2)
    expect([...z!.deInferior].sort()).toEqual([cid("inf3"), cid("inf4")].sort())
    // pareamento DIRETO: melhor de baixo × melhor de cima, índice a índice
    expect(z!.pares).toEqual([
      [cid("inf3"), cid("sup5")],
      [cid("inf4"), cid("sup6")],
    ])
  })

  it("chave: 1 defensor de d (seed 1) + k de d+1", () => {
    const z = zonaBarragemPorPosicao({
      estilo: "chave",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      playoffVagas: 4, // k=3
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
    })
    expect(z).not.toBeNull()
    expect(z!.ordenados).toEqual([
      cid("sup6"), // defensor = pior não-rebaixado (pos 6) como seed 1
      cid("inf3"),
      cid("inf4"),
      cid("inf5"),
    ])
    expect([...z!.deSuperior]).toEqual([cid("sup6")])
  })

  it("zona que não cabe ⇒ null (defensivo)", () => {
    const z = zonaBarragemPorPosicao({
      estilo: "pares",
      vagasAcesso: 2,
      vagasRebaixamento: 1,
      playoffVagas: 4, // B=2; A+B=4 > inf.length=3
      superiorOrdenada: ord("sup", 4),
      inferiorOrdenada: ord("inf", 3),
    })
    expect(z).toBeNull()
  })
})

describe("combinarFronteiraBarragem (Fase 3)", () => {
  const ord = (prefixo: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      competitorId: cid(`${prefixo}${i + 1}`),
      posicao: i + 1,
    }))

  it("pares: vencedor de baixo sobe + perdedor de cima cai; auto-balanceado", () => {
    const r = combinarFronteiraBarragem({
      estilo: "pares",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
      deSuperior: new Set([cid("sup5"), cid("sup6")]),
      deInferior: new Set([cid("inf3"), cid("inf4")]),
      resultadoPares: [
        { vencedor: cid("inf3"), perdedor: cid("sup5") }, // vira: inf3 sobe, sup5 cai
        { vencedor: cid("sup6"), perdedor: cid("inf4") }, // não vira: nada
      ],
    })
    expect([...r.sobem].sort()).toEqual(
      [cid("inf1"), cid("inf2"), cid("inf3")].sort()
    )
    expect([...r.caem].sort()).toEqual(
      [cid("sup7"), cid("sup8"), cid("sup5")].sort()
    )
    expect([...r.sobemPorChave]).toEqual([cid("inf3")])
    expect([...r.caemPorChave]).toEqual([cid("sup5")])
    // auto-balanceado
    expect(r.sobemPorChave.size).toBe(r.caemPorChave.size)
  })

  it("chave: campeão de baixo sobe + defensor de cima cai", () => {
    const r = combinarFronteiraBarragem({
      estilo: "chave",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
      deSuperior: new Set([cid("sup6")]),
      deInferior: new Set([cid("inf3"), cid("inf4"), cid("inf5")]),
      campeao: cid("inf3"),
    })
    expect([...r.sobemPorChave]).toEqual([cid("inf3")])
    expect([...r.caemPorChave]).toEqual([cid("sup6")])
    expect([...r.sobem].sort()).toEqual(
      [cid("inf1"), cid("inf2"), cid("inf3")].sort()
    )
    expect([...r.caem].sort()).toEqual(
      [cid("sup7"), cid("sup8"), cid("sup6")].sort()
    )
  })

  it("chave: campeão é o defensor ⇒ nada se move pela chave", () => {
    const r = combinarFronteiraBarragem({
      estilo: "chave",
      vagasAcesso: 2,
      vagasRebaixamento: 2,
      superiorOrdenada: ord("sup", 8),
      inferiorOrdenada: ord("inf", 8),
      deSuperior: new Set([cid("sup6")]),
      deInferior: new Set([cid("inf3"), cid("inf4"), cid("inf5")]),
      campeao: cid("sup6"),
    })
    expect(r.sobemPorChave.size).toBe(0)
    expect(r.caemPorChave.size).toBe(0)
    expect([...r.sobem].sort()).toEqual([cid("inf1"), cid("inf2")].sort())
    expect([...r.caem].sort()).toEqual([cid("sup7"), cid("sup8")].sort())
  })
})

/* -------------------------------------------------------------------------- */
/* Promedios (Fase 4)                                                          */
/* -------------------------------------------------------------------------- */

describe("calcularPromedio (Fase 4)", () => {
  it("soma histórico + atual (vida toda) e divide", () => {
    // 38 + 50 = 88 pontos em 38 + 40 = 78 jogos.
    expect(
      calcularPromedio({
        historicoPontos: 50,
        historicoJogos: 40,
        atualPontos: 38,
        atualJogos: 38,
      })
    ).toBeCloseTo(88 / 78, 10)
  })

  it("recém-chegado (sem histórico) = PPG da temporada atual", () => {
    expect(
      calcularPromedio({
        historicoPontos: 0,
        historicoJogos: 0,
        atualPontos: 30,
        atualJogos: 20,
      })
    ).toBeCloseTo(1.5, 10)
  })

  it("Σjogos = 0 ⇒ 0 (sem divisão por zero)", () => {
    expect(
      calcularPromedio({
        historicoPontos: 0,
        historicoJogos: 0,
        atualPontos: 0,
        atualJogos: 0,
      })
    ).toBe(0)
  })

  it("'0 por ausência de jogos' e 'PPG baixo positivo' são distintos", () => {
    const ausente = calcularPromedio({
      historicoPontos: 0,
      historicoJogos: 0,
      atualPontos: 0,
      atualJogos: 0,
    })
    const baixo = calcularPromedio({
      historicoPontos: 0,
      historicoJogos: 0,
      atualPontos: 1,
      atualJogos: 10,
    })
    expect(ausente).toBe(0)
    expect(baixo).toBeGreaterThan(ausente)
  })
})

describe("rankearPorPromedio (Fase 4)", () => {
  it("ordena por promedio desc e gera rank contíguo 1..n", () => {
    const rank = rankearPorPromedio([
      { competitorId: cid("a"), promedio: 1.2, posicaoReal: 3 },
      { competitorId: cid("b"), promedio: 2.0, posicaoReal: 1 },
      { competitorId: cid("c"), promedio: 1.6, posicaoReal: 2 },
    ])
    expect(rank.get(cid("b"))).toBe(1)
    expect(rank.get(cid("c"))).toBe(2)
    expect(rank.get(cid("a"))).toBe(3)
    // contiguidade: exatamente {1,2,3}
    expect([...rank.values()].sort()).toEqual([1, 2, 3])
  })

  it("desempata promedio igual pela posição REAL da tabela (asc)", () => {
    const rank = rankearPorPromedio([
      { competitorId: cid("x"), promedio: 1.5, posicaoReal: 12 },
      { competitorId: cid("y"), promedio: 1.5, posicaoReal: 4 },
    ])
    // mesmo promedio ⇒ quem foi melhor na tabela (posição menor) vem antes.
    expect(rank.get(cid("y"))).toBe(1)
    expect(rank.get(cid("x"))).toBe(2)
  })

  it("promedio E posição real iguais ⇒ desempate determinístico por competitorId (total order, sem empate)", () => {
    const rank = rankearPorPromedio([
      { competitorId: "comp-zzz", promedio: 1.0, posicaoReal: 5 },
      { competitorId: "comp-aaa", promedio: 1.0, posicaoReal: 5 },
    ])
    expect(rank.get("comp-aaa")).toBe(1)
    expect(rank.get("comp-zzz")).toBe(2)
    // INVARIANTE DURA: rank total, contíguo, sem buracos nem duplicatas.
    expect([...rank.values()].sort()).toEqual([1, 2])
  })

  it("'0 por ausência' vai ao fundo, ordenado por posição real entre os 0", () => {
    const rank = rankearPorPromedio([
      { competitorId: cid("forte"), promedio: 2.1, posicaoReal: 1 },
      { competitorId: cid("zero-pos8"), promedio: 0, posicaoReal: 8 },
      { competitorId: cid("zero-pos6"), promedio: 0, posicaoReal: 6 },
    ])
    expect(rank.get(cid("forte"))).toBe(1)
    // entre os promedio 0, a posição real decide (6 antes de 8).
    expect(rank.get(cid("zero-pos6"))).toBe(2)
    expect(rank.get(cid("zero-pos8"))).toBe(3)
  })
})
