import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { LeagueSeasonStatus } from "@/features/league/leagueStatus"

/** Resumo de uma pirâmide para o índice /dashboard/ligas. */
export interface PiramideResumo {
  id: string
  nome: string
  /** Nº de divisões da temporada corrente (a maior numeração). */
  numDivisoes: number
  /** Número da temporada corrente (1-based) — null se nenhuma temporada existe. */
  temporadaAtual: number | null
  /** Status da temporada corrente — insumo da pílula. */
  statusTemporada: LeagueSeasonStatus | null
  /** Id da temporada corrente (alvo do link "abrir"). */
  seasonAtualId: string | null
}

/** Forma crua da linha de temporada embutida na pirâmide. */
interface SeasonEmbed {
  id: string
  numero: number
  status: LeagueSeasonStatus
  league_division_seasons: { count: number }[]
}

/**
 * Pirâmides do usuário para o índice /dashboard/ligas. Filtra por
 * `created_by` (a RLS também deixa passar pirâmides públicas de terceiros, então
 * confiar só nela listaria ligas alheias — espelha getMeusTorneios). Embute as
 * temporadas com a CONTAGEM de divisões; a "temporada corrente" é a de maior
 * `numero`. Ordena as pirâmides pela mais recente.
 */
export async function getCompetitions(userId: string): Promise<PiramideResumo[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("league_competitions")
    .select(
      "id, nome, created_at, league_seasons(id, numero, status, league_division_seasons(count))"
    )
    .eq("created_by", userId)
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error(`Falha ao carregar suas pirâmides: ${error.message}`)
  }

  const linhas = (data ?? []) as unknown as Array<{
    id: string
    nome: string
    league_seasons: SeasonEmbed[]
  }>

  return linhas.map((piramide) => {
    // Temporada corrente = a de maior numero (a "ponta" da cadeia).
    const corrente = [...piramide.league_seasons].sort(
      (a, b) => b.numero - a.numero
    )[0]
    const numDivisoes = corrente?.league_division_seasons[0]?.count ?? 0
    return {
      id: piramide.id,
      nome: piramide.nome,
      numDivisoes,
      temporadaAtual: corrente?.numero ?? null,
      statusTemporada: corrente?.status ?? null,
      seasonAtualId: corrente?.id ?? null,
    }
  })
}
