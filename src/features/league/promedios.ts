import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  calcularPromedio,
  rankearPorPromedio,
  type CompetidorPromedio,
} from "@/features/league/flowEngine"
import type { LeagueRankingBase } from "@/lib/supabase/database.types"

/** Linha REAL de uma divisão (posição da tabela + campanha do ano). */
export interface LinhaReal {
  competitorId: string
  /** Posição na tabela da temporada corrente (resultado esportivo). */
  posicaoReal: number
  /** Pontos somados na temporada corrente (ao vivo). */
  pontos: number
  /** Jogos disputados na temporada corrente (ao vivo). */
  jogos: number
}

/** Resultado: rank de corte por competidor + promedio (vazio fora de 'promedios'). */
export interface PosicoesDeCorte {
  /** competitorId → posição de corte (posição real em 'posicao'/'ppg'; rank em 'promedios'). */
  posicaoCorte: Map<string, number>
  /** competitorId → promedio de vida toda (só preenchido em 'promedios'). */
  promedio: Map<string, number>
}

/**
 * FONTE ÚNICA do "rank de corte" de uma divisão — consumida por
 * `calcularFluxoTemporada`, `montarPlayoffs` (zonas + seeding) e
 * `getDivisionStandings` (exibição). Mantém montagem ≡ cálculo (evita o bug de
 * "consumidor órfão": a chave semeada por posição enquanto o fluxo corta por
 * promedio).
 *
 * - `posicao`/`ppg`: `posicaoCorte` = a posição REAL da tabela (byte-idêntico ao
 *   legado); `promedio` vazio.
 * - `promedios`: soma o histórico de VIDA TODA do competidor (todas as temporadas
 *   anteriores, todas as divisões — `league_division_entries` com `posicao_final`
 *   NOT NULL, EXCLUINDO as divisões da temporada atual para não contar 2×) + a
 *   campanha AO VIVO da temporada corrente, computa o promedio e gera um rank
 *   contíguo 1..n (sem empates ⇒ sem sorteio).
 *
 * Recebe `supabase` como argumento (NÃO é Server Action — IO puro reutilizável).
 * Retorna `null` em erro de IO.
 */
export async function carregarPosicoesDeCorte(
  supabase: Awaited<ReturnType<typeof createClient>>,
  excluirDivisionSeasonIds: readonly string[],
  rankingBase: LeagueRankingBase,
  linhas: readonly LinhaReal[]
): Promise<PosicoesDeCorte | null> {
  // 'posicao' (e 'ppg', latente — dentro de uma divisão equivale a posição): o
  // corte segue a tabela. Sem IO.
  if (rankingBase !== "promedios") {
    const posicaoCorte = new Map<string, number>()
    for (const l of linhas) posicaoCorte.set(l.competitorId, l.posicaoReal)
    return { posicaoCorte, promedio: new Map() }
  }

  // 'promedios': busca o histórico consolidado (posicao_final NOT NULL =
  // temporadas já encerradas) destes competidores. O competidor_id já restringe à
  // competição (league_competitors é por competição). Filtramos as entries da
  // temporada ATUAL em JS (GUARDA PRINCIPAL anti-duplo-conta).
  const ids = linhas.map((l) => l.competitorId)
  const { data: historico, error } = await supabase
    .from("league_division_entries")
    .select("competitor_id, pontos, jogos, division_season_id")
    .in("competitor_id", ids)
    .not("posicao_final", "is", null)
  if (error) {
    console.error("carregarPosicoesDeCorte: histórico", error.code ?? error.message)
    return null
  }

  const excluir = new Set(excluirDivisionSeasonIds)
  const histPontos = new Map<string, number>()
  const histJogos = new Map<string, number>()
  for (const e of historico ?? []) {
    if (e.division_season_id && excluir.has(e.division_season_id)) continue
    histPontos.set(e.competitor_id, (histPontos.get(e.competitor_id) ?? 0) + (e.pontos ?? 0))
    histJogos.set(e.competitor_id, (histJogos.get(e.competitor_id) ?? 0) + (e.jogos ?? 0))
  }

  const promedio = new Map<string, number>()
  const paraRank: CompetidorPromedio[] = linhas.map((l) => {
    const p = calcularPromedio({
      historicoPontos: histPontos.get(l.competitorId) ?? 0,
      historicoJogos: histJogos.get(l.competitorId) ?? 0,
      atualPontos: l.pontos,
      atualJogos: l.jogos,
    })
    promedio.set(l.competitorId, p)
    return { competitorId: l.competitorId, promedio: p, posicaoReal: l.posicaoReal }
  })

  return { posicaoCorte: rankearPorPromedio(paraRank), promedio }
}
