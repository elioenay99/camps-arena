import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  getTournamentClassificacao,
  type LinhaComNome,
} from "@/features/standings/data/getTournamentClassificacao"
import type { TournamentStatus } from "@/lib/supabase/database.types"

/** Posições (1-based) que sobem / caem numa divisão. */
export interface Zonas {
  acesso: number[]
  rebaixamento: number[]
}

/** Classificação de UMA divisão da pirâmide, com as zonas de sobe/cai. */
export interface DivisaoStandings {
  /** Linhas já com nome resolvido (rótulo = identidade do competidor). */
  linhas: LinhaComNome[]
  /** Status do torneio da divisão (rascunho/ativo/encerrado). */
  status: TournamentStatus
  /** Posições de acesso/rebaixamento desta divisão (vazias se sem fronteira). */
  zonas: Zonas
}

/**
 * Deriva as zonas (posições 1-based) de uma divisão a partir das fronteiras:
 *  - a fronteira ACIMA (nivelSuperior = nivel - 1) define quantos SOBEM (as
 *    `vagasAcesso` PRIMEIRAS posições desta divisão);
 *  - a fronteira ABAIXO (nivelSuperior = nivel) define quantos CAEM (as
 *    `vagasRebaixamento` ÚLTIMAS posições, contadas do total de competidores).
 * Função PURA — o cálculo do destino real (com empate/sorteio) vive na action;
 * aqui é só o destaque visual da tabela, posicional.
 */
export function derivarZonas(
  nivel: number,
  total: number,
  fronteiras: readonly {
    nivelSuperior: number
    vagasAcesso: number
    vagasRebaixamento: number
  }[]
): Zonas {
  const acima = fronteiras.find((f) => f.nivelSuperior === nivel - 1)
  const abaixo = fronteiras.find((f) => f.nivelSuperior === nivel)

  const acesso: number[] = []
  const nAcesso = Math.min(acima?.vagasAcesso ?? 0, total)
  for (let p = 1; p <= nAcesso; p++) acesso.push(p)

  const rebaixamento: number[] = []
  const nQueda = Math.min(abaixo?.vagasRebaixamento ?? 0, total)
  for (let p = total - nQueda + 1; p <= total; p++) {
    if (p >= 1) rebaixamento.push(p)
  }

  return { acesso, rebaixamento }
}

/**
 * Classificação de uma divisão (reúso TOTAL do motor de liga). Carrega o
 * `tournament_id` da divisão (filtrando por posse transitiva) e delega a
 * `getTournamentClassificacao`, depois TROCA a identidade de cada linha: o motor
 * chaveia por `slot_id` e nomeia pelo clube/rótulo do slot — aqui reescrevemos o
 * `participanteId` para o `competitor_id` (estável entre temporadas), mantendo o
 * nome/escudo já resolvido. As zonas (acesso/rebaixamento) saem das fronteiras.
 *
 * Retorna `null` se a divisão não existe, é de liga alheia ou ainda não foi
 * montada (sem torneio) — a página decide o que mostrar.
 */
export async function getDivisionStandings(
  divisionSeasonId: string,
  userId: string,
  fronteiras: readonly {
    nivelSuperior: number
    vagasAcesso: number
    vagasRebaixamento: number
  }[]
): Promise<DivisaoStandings | null> {
  const supabase = await createClient()

  // Divisão + posse por FILTRO transitivo (divisão → season → competition).
  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select(
      "id, nivel, tournament_id, league_seasons!inner ( league_competitions!inner ( created_by ) )"
    )
    .eq("id", divisionSeasonId)
    .eq("league_seasons.league_competitions.created_by", userId)
    .maybeSingle()

  if (divError) {
    throw new Error(`Falha ao carregar a divisão: ${divError.message}`)
  }
  if (!divisao || !divisao.tournament_id) {
    return null
  }

  // slot_id → competitor_id (via entries da divisão) para reescrever a identidade.
  const { data: entries, error: entriesError } = await supabase
    .from("league_division_entries")
    .select("competitor_id, slot_id")
    .eq("division_season_id", divisionSeasonId)

  if (entriesError) {
    throw new Error(`Falha ao carregar as vagas da divisão: ${entriesError.message}`)
  }
  const competitorPorSlot = new Map<string, string>()
  for (const e of entries ?? []) {
    if (e.slot_id) competitorPorSlot.set(e.slot_id, e.competitor_id)
  }

  const classificacao = await getTournamentClassificacao(divisao.tournament_id)
  if (!classificacao) {
    return null
  }

  // Reescreve a chave da linha para o competitor_id (estável); o nome/escudo do
  // motor já é o do clube/rótulo do slot — preservado.
  const linhas: LinhaComNome[] = classificacao.linhas.map((linha) => ({
    ...linha,
    participanteId:
      competitorPorSlot.get(linha.participanteId) ?? linha.participanteId,
  }))

  const zonas = derivarZonas(divisao.nivel, linhas.length, fronteiras)

  return {
    linhas,
    status: classificacao.torneio.status,
    zonas,
  }
}
