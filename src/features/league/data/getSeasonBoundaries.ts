import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { LeagueBoundaryMode } from "@/lib/supabase/database.types"

/**
 * Linha bruta de `league_boundaries` (superset das colunas que os consumidores
 * da página da temporada precisam): o sobe/cai DIRETO + toda a config de playoff
 * (modo/estilo/vagas/ida-e-volta) + o torneio da chave. `getDivisionStandings`
 * lê só um SUBCONJUNTO (nivel/modo/estilo/vagas); `getPlayoffs` lê o conjunto
 * inteiro. Manter o superset aqui permite UMA viagem que serve aos dois.
 */
export interface SeasonBoundaryRow {
  nivel_superior: number
  vagas_acesso: number
  vagas_rebaixamento: number
  modo: LeagueBoundaryMode
  playoff_estilo: string | null
  playoff_vagas: number | null
  playoff_ida_e_volta: boolean
  playoff_tournament_id: string | null
}

/**
 * FONTE ÚNICA das fronteiras (`league_boundaries`) de uma temporada para a
 * página `/dashboard/ligas/[id]`. `cache()` (React) deduplica DENTRO da mesma
 * requisição: hoje `getDivisionStandings` re-busca as fronteiras da MESMA season
 * uma vez POR DIVISÃO (N viagens idênticas) e `getPlayoffs` busca de novo — todas
 * com o mesmo `season_id`. Com a memoização por `seasonId`, todas essas chamadas
 * colapsam numa única viagem ao banco no request.
 *
 * Sem gate de posse próprio: as fronteiras são config PÚBLICA da season (a RLS
 * de `league_boundaries` não diverge por usuário; o que diverge por dono/não-dono
 * é a leitura de `matches`, resolvida noutro caminho). Os callers já filtraram a
 * posse da temporada antes de chegar aqui (getDivisionStandings/getPlayoffs
 * carregam a season com `created_by = user`). Lê SÓ por `season_id` — o mesmo
 * filtro que os dois consumidores usavam, preservando o conjunto de linhas.
 *
 * Lança em erro de IO (mesma semântica que os dois consumidores tinham antes —
 * `getDivisionStandings`/`getPlayoffs` lançavam ao falhar a query de fronteiras;
 * a página vira 500). Preserva o caminho de erro observável intacto.
 */
export const getSeasonBoundaries = cache(async function getSeasonBoundaries(
  seasonId: string
): Promise<SeasonBoundaryRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("league_boundaries")
    .select(
      "nivel_superior, vagas_acesso, vagas_rebaixamento, modo, playoff_estilo, playoff_vagas, playoff_ida_e_volta, playoff_tournament_id"
    )
    .eq("season_id", seasonId)

  if (error) {
    throw new Error(`Falha ao carregar as fronteiras da temporada: ${error.message}`)
  }

  return (data ?? []) as unknown as SeasonBoundaryRow[]
})
