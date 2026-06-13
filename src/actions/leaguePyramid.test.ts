import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// getTournamentClassificacao é server-only e bate no banco — fora do escopo dos
// testes de lógica pura. As actions que o usam não são exercitadas aqui.
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: vi.fn(),
}))

import {
  calcularPlanoFluxo,
  createCompetition,
  montarTemporada,
  ordemSorteada,
  prngDeSemente,
  resolverZonaDeCorte,
  validarFechamentoTamanho,
  type DivisaoFluxo,
  type FronteiraFluxo,
  type ItemPlanoFluxo,
  type LinhaFluxo,
} from "@/actions/leaguePyramid"
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
    // Exatamente 1 sorteado (a vaga restante entre B/C/D).
    expect(r.sorteados.size).toBe(1)
    const sorteado = [...r.sorteados][0]
    expect([cid("B"), cid("C"), cid("D")]).toContain(sorteado)

    // Determinismo: a mesma semente reproduz a MESMA escolha.
    const r2 = resolverZonaDeCorte(linhas, 2, "top", "fixo")
    expect([...r2.escolhidos].sort()).toEqual([...r.escolhidos].sort())
    expect([...r2.sorteados]).toEqual([...r.sorteados])
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
    // Quem caiu foi por SORTEIO (empate na linha de corte).
    expect(caem[0].resolvidoPor).toBe("sorteio")
    expect([cid("C"), cid("D")]).toContain(caem[0].competitorId)
    // A vitória da divisão 1 (A) e o vice (B) permanecem por classificação.
    const permanece = plano.itens.filter(
      (i) => i.nivelOrigem === 1 && i.destino === "permanece"
    )
    expect(permanece.every((i) => i.resolvidoPor === "classificacao")).toBe(true)

    // Determinismo: mesma semente ⇒ mesmo competidor rebaixado.
    const plano2 = calcularPlanoFluxo([div1, div2], fronteiras, "seed-fixa")
    const caem2 = plano2.itens.filter(
      (i) => i.nivelOrigem === 1 && i.destino === "cai"
    )
    expect(caem2[0].competitorId).toBe(caem[0].competitorId)

    // Conservação preservada mesmo com sorteio.
    expect(validarFechamentoTamanho(plano.itens).ok).toBe(true)
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
