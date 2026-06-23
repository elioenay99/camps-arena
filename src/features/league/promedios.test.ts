import { describe, expect, it, vi } from "vitest"

// `promedios.ts` é server-only e importa o client do Supabase só p/ tipar o arg —
// mockamos ambos para exercitar a LÓGICA pura de agregação/rank com um client
// fake (o helper recebe o client por argumento, não o cria).
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { carregarPosicoesDeCorte, type LinhaReal } from "@/features/league/promedios"

type HistRow = {
  competitor_id: string
  pontos: number
  jogos: number
  division_season_id: string
}

const PAGINA = 1000

/**
 * Client fake: `from().select().in().not().order().range(from,to)` resolve a página
 * pedida. `.range` fatia `rows` pelo offset (a última página, < PAGINA linhas, encerra
 * o laço do helper). `erro` faz QUALQUER página falhar.
 */
function fakeSupabase(rows: HistRow[], erro = false) {
  const chain = {
    select: () => chain,
    in: () => chain,
    not: () => chain,
    order: () => chain,
    range: (from: number, to: number) =>
      Promise.resolve(
        erro
          ? { data: null, error: { message: "boom", code: "42P01" } }
          : { data: rows.slice(from, to + 1), error: null }
      ),
  }
  return { from: () => chain } as unknown as Parameters<typeof carregarPosicoesDeCorte>[0]
}

const cid = (n: string) => `comp-${n}`

describe("carregarPosicoesDeCorte (integração — Fase 4)", () => {
  it("ranking_base='posicao': corte = posição real, sem IO, promedio vazio", async () => {
    const linhas: LinhaReal[] = [
      { competitorId: cid("a"), posicaoReal: 1, pontos: 6, jogos: 2 },
      { competitorId: cid("b"), posicaoReal: 2, pontos: 3, jogos: 2 },
    ]
    // `from` lança se for chamado — prova que 'posicao' não faz IO.
    const supabase = {
      from: () => {
        throw new Error("não deveria consultar o banco em 'posicao'")
      },
    } as unknown as Parameters<typeof carregarPosicoesDeCorte>[0]

    const r = await carregarPosicoesDeCorte(supabase, ["div-atual"], "posicao", linhas)
    expect(r).not.toBeNull()
    expect(r!.posicaoCorte.get(cid("a"))).toBe(1)
    expect(r!.posicaoCorte.get(cid("b"))).toBe(2)
    expect(r!.promedio.size).toBe(0)
  })

  it("ranking_base='promedios': o rank segue a VIDA TODA, divergindo da tabela do ano", async () => {
    // Tabela do ano: C 1º, B 2º, A 3º (último). Mas o HISTÓRICO inverte tudo.
    const linhas: LinhaReal[] = [
      { competitorId: cid("a"), posicaoReal: 3, pontos: 0, jogos: 2 },
      { competitorId: cid("b"), posicaoReal: 2, pontos: 3, jogos: 2 },
      { competitorId: cid("c"), posicaoReal: 1, pontos: 6, jogos: 2 },
    ]
    const historico: HistRow[] = [
      { competitor_id: cid("a"), pontos: 100, jogos: 10, division_season_id: "passada-1" },
      { competitor_id: cid("b"), pontos: 10, jogos: 10, division_season_id: "passada-1" },
      { competitor_id: cid("c"), pontos: 0, jogos: 10, division_season_id: "passada-1" },
    ]
    const r = await carregarPosicoesDeCorte(
      fakeSupabase(historico),
      ["div-atual"],
      "promedios",
      linhas
    )
    expect(r).not.toBeNull()
    // promedio de vida toda = (hist + atual) / (histJogos + atualJogos)
    expect(r!.promedio.get(cid("a"))).toBeCloseTo(100 / 12, 10) // (100+0)/(10+2)
    expect(r!.promedio.get(cid("b"))).toBeCloseTo(13 / 12, 10) // (10+3)/12
    expect(r!.promedio.get(cid("c"))).toBeCloseTo(6 / 12, 10) // (0+6)/12
    // Rank de corte: A (melhor promedio) é 1º; C (último no ano) é o ÚLTIMO no corte.
    expect(r!.posicaoCorte.get(cid("a"))).toBe(1)
    expect(r!.posicaoCorte.get(cid("b"))).toBe(2)
    expect(r!.posicaoCorte.get(cid("c"))).toBe(3)
  })

  it("anti-duplo-conta: entries das divisões da temporada ATUAL são excluídas da soma", async () => {
    const linhas: LinhaReal[] = [
      { competitorId: cid("x"), posicaoReal: 1, pontos: 4, jogos: 2 },
    ]
    const historico: HistRow[] = [
      { competitor_id: cid("x"), pontos: 20, jogos: 10, division_season_id: "passada-1" },
      // Entry da temporada ATUAL (já com posicao_final por reprocessamento): NÃO conta.
      { competitor_id: cid("x"), pontos: 999, jogos: 999, division_season_id: "div-atual" },
    ]
    const r = await carregarPosicoesDeCorte(
      fakeSupabase(historico),
      ["div-atual"],
      "promedios",
      linhas
    )
    // Só conta a histórica (20/10) + atual ao vivo (4/2): (20+4)/(10+2) = 2.0.
    expect(r!.promedio.get(cid("x"))).toBeCloseTo(24 / 12, 10)
  })

  it("paginação: soma TODAS as páginas (histórico > 1 página)", async () => {
    // Histórico maior que uma página (PAGINA+1 linhas): a 1ª página vem cheia (PAGINA
    // linhas), a 2ª vem com 1 → encerra o laço. A soma DEVE cobrir as duas páginas.
    const linhas: LinhaReal[] = [{ competitorId: cid("p"), posicaoReal: 1, pontos: 0, jogos: 0 }]
    // Cada linha contribui pontos=1, jogos=1. Total de linhas = PAGINA + 1.
    const historico: HistRow[] = Array.from({ length: PAGINA + 1 }, () => ({
      competitor_id: cid("p"),
      pontos: 1,
      jogos: 1,
      division_season_id: "passada-1",
    }))
    const r = await carregarPosicoesDeCorte(
      fakeSupabase(historico),
      ["div-atual"],
      "promedios",
      linhas
    )
    expect(r).not.toBeNull()
    // Σpontos/Σjogos = (PAGINA+1) / (PAGINA+1) = 1.0. Se uma página fosse perdida, ≠ 1.0
    // só por arredondamento — mas a contagem confirma a soma completa.
    expect(r!.promedio.get(cid("p"))).toBeCloseTo(1, 10)
  })

  it("paginação: erro em página posterior propaga ⇒ null", async () => {
    // Garante que o erro de QUALQUER página (não só a 1ª) derruba a operação.
    const linhas: LinhaReal[] = [{ competitorId: cid("q"), posicaoReal: 1, pontos: 3, jogos: 2 }]
    const historico: HistRow[] = Array.from({ length: PAGINA + 1 }, () => ({
      competitor_id: cid("q"),
      pontos: 1,
      jogos: 1,
      division_season_id: "passada-1",
    }))
    // Mock que falha SÓ na 2ª chamada de range (offset > 0).
    let chamada = 0
    const chain: Record<string, unknown> = {
      select: () => chain,
      in: () => chain,
      not: () => chain,
      order: () => chain,
      range: (from: number, to: number) => {
        chamada += 1
        if (chamada >= 2) {
          return Promise.resolve({ data: null, error: { message: "boom", code: "42P01" } })
        }
        return Promise.resolve({ data: historico.slice(from, to + 1), error: null })
      },
    }
    const supabase = {
      from: () => chain,
    } as unknown as Parameters<typeof carregarPosicoesDeCorte>[0]
    const r = await carregarPosicoesDeCorte(supabase, ["div-atual"], "promedios", linhas)
    expect(r).toBeNull()
  })

  it("recém-chegado (sem histórico): promedio = PPG da temporada atual", async () => {
    const linhas: LinhaReal[] = [
      { competitorId: cid("novato"), posicaoReal: 5, pontos: 9, jogos: 6 },
    ]
    const r = await carregarPosicoesDeCorte(fakeSupabase([]), ["div-atual"], "promedios", linhas)
    expect(r!.promedio.get(cid("novato"))).toBeCloseTo(1.5, 10) // 9/6
    expect(r!.posicaoCorte.get(cid("novato"))).toBe(1)
  })

  it("erro de IO ⇒ null (fail-safe, sem corromper o cálculo)", async () => {
    const linhas: LinhaReal[] = [
      { competitorId: cid("a"), posicaoReal: 1, pontos: 3, jogos: 2 },
    ]
    const r = await carregarPosicoesDeCorte(
      fakeSupabase([], true),
      ["div-atual"],
      "promedios",
      linhas
    )
    expect(r).toBeNull()
  })
})
