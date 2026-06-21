import "server-only"

import {
  resultadoBarragemPares,
  resultadoDaChave,
  type PartidaJogada,
} from "@/features/knockout/gerarChaveMataMata"
import {
  getTournamentClassificacao,
  type PartidaDaChave,
} from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"
import { podeVerBastidores } from "@/lib/autorizacao"
import { getSeasonBoundaries } from "@/features/league/data/getSeasonBoundaries"
import type { TournamentStatus } from "@/lib/supabase/database.types"

/** Uma fronteira não-`direto` (playoff/playout/barragem) da temporada, com a chave carregada. */
export interface PlayoffFronteira {
  /** Nível d da fronteira (d ⇄ d+1). */
  nivelSuperior: number
  modo: "playoff_acesso" | "playout" | "barragem_cruzada"
  estilo: "vagas" | "extra" | "pares" | "chave"
  playoffVagas: number
  vagasAcesso: number
  vagasRebaixamento: number
  idaEVolta: boolean
  /** Torneio da chave — null enquanto não montada (idempotência). */
  playoffTournamentId: string | null
  /** Status do torneio da chave (null quando não montada). */
  torneioStatus: TournamentStatus | null
  /** Partidas da chave (vazio quando não montada) — insumo do BracketView. */
  partidas: PartidaDaChave[]
  /** A chave já resolveu o sobe/cai (`resultadoDaChave(...).decidida`). */
  decidida: boolean
}

/** Estado de playoff da temporada para a página /dashboard/ligas/[id]. */
export interface PlayoffsTemporada {
  /** Há ao menos uma fronteira não-`direto` nesta temporada. */
  temPlayoffs: boolean
  /** Alguma chave já foi montada (tem `playoff_tournament_id`). */
  algumaMontada: boolean
  /** TODA fronteira de playoff tem chave montada E decidida. */
  resolvidos: boolean
  /** As fronteiras de playoff, ordenadas por nível superior ascendente. */
  fronteiras: PlayoffFronteira[]
}

/** Converte as partidas da chave (shape da UI) para o shape que o motor consome. */
function paraPartidaJogada(partidas: PartidaDaChave[]): PartidaJogada[] {
  return partidas.map((p) => ({
    rodada: p.rodada,
    posicao: p.posicao,
    perna: p.perna,
    participante_1: p.participante_1,
    participante_2: p.participante_2,
    placar_1: p.placar_1,
    placar_2: p.placar_2,
    status: p.status,
    woVencedor: p.wo ? (p.woVencedor ?? null) : null,
  }))
}

/**
 * Carrega o estado de PLAYOFF de uma temporada (fronteiras não-`direto` + as
 * chaves montadas) para a página da temporada. Autorização por CAPACIDADE
 * (`podeVerBastidores` = dono ou qualquer membro/papel da liga) + RLS como
 * backstop: temporada inexistente ou sem capacidade → estado vazio
 * (`temPlayoffs: false`).
 *
 * O parâmetro `_userId` é mantido por compatibilidade com os call-sites; a
 * autorização NÃO o usa mais — deriva a capacidade da `competition_id` da season.
 *
 * Para cada fronteira de playoff já montada, busca a CHAVE via
 * `getTournamentClassificacao(playoffTournamentId).chave` (reúso TOTAL do motor)
 * e deriva `decidida` por `resultadoDaChave` — FONTE ÚNICA de "chave resolvida"
 * (mesma do backend em `calcularFluxoTemporada`). `resolvidos` exige que TODAS
 * as fronteiras de playoff estejam montadas e decididas; só então a página libera
 * o painel de fim de temporada.
 */
export async function getPlayoffs(
  seasonId: string,
  _userId?: string
): Promise<PlayoffsTemporada> {
  void _userId
  const supabase = await createClient()
  const vazio: PlayoffsTemporada = {
    temPlayoffs: false,
    algumaMontada: false,
    resolvidos: false,
    fronteiras: [],
  }

  // Carrega a season + competition_id (para a checagem de capacidade). Sem filtro
  // por `created_by`: a autorização é `podeVerBastidores` abaixo. As fronteiras
  // vêm da FONTE ÚNICA memoizada (abaixo), não mais embutidas.
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select(`id, competition_id`)
    .eq("id", seasonId)
    .maybeSingle()

  if (seasonError) {
    throw new Error(`Falha ao carregar os playoffs: ${seasonError.message}`)
  }
  if (!season) {
    return vazio
  }
  // Autorização por CAPACIDADE: ver bastidores (dono ou qualquer membro/papel).
  if (!(await podeVerBastidores(supabase, { competitionId: season.competition_id }))) {
    return vazio
  }

  // FONTE ÚNICA das fronteiras (`getSeasonBoundaries`, memoizada por `season_id`):
  // deduplica com as N chamadas de `getDivisionStandings` no mesmo request — uma
  // viagem ao banco em vez de uma por consumidor.
  const boundariesRaw = await getSeasonBoundaries(seasonId)

  // Só as fronteiras de playoff/playout (modo ≠ 'direto'), ordenadas por nível.
  const playoffBoundaries = boundariesRaw
    .filter((f) => f.modo !== "direto")
    .sort((a, b) => a.nivel_superior - b.nivel_superior)

  if (playoffBoundaries.length === 0) {
    return vazio
  }

  // Carrega cada chave em paralelo (uma viagem por fronteira montada).
  const fronteiras: PlayoffFronteira[] = await Promise.all(
    playoffBoundaries.map(async (f): Promise<PlayoffFronteira> => {
      const modo = f.modo as "playoff_acesso" | "playout" | "barragem_cruzada"
      const estilo = (f.playoff_estilo ?? "vagas") as
        | "vagas"
        | "extra"
        | "pares"
        | "chave"
      const playoffVagas = f.playoff_vagas ?? 0

      const base: PlayoffFronteira = {
        nivelSuperior: f.nivel_superior,
        modo,
        estilo,
        playoffVagas,
        vagasAcesso: f.vagas_acesso,
        vagasRebaixamento: f.vagas_rebaixamento,
        idaEVolta: f.playoff_ida_e_volta,
        playoffTournamentId: f.playoff_tournament_id,
        torneioStatus: null,
        partidas: [],
        decidida: false,
      }

      if (!f.playoff_tournament_id) {
        // Chave ainda não montada — só os metadados da fronteira.
        return base
      }

      const classificacao = await getTournamentClassificacao(
        f.playoff_tournament_id
      )
      if (!classificacao) {
        return base
      }

      const partidas = classificacao.chave
      // `decidida` pela MESMA fonte pura do backend (calcularFluxoTemporada):
      // barragem `pares` → resultadoBarragemPares; barragem `chave` → chave 1-vaga
      // 'extra'; playoff/playout → resultadoDaChave com o lado favorável.
      let decidida = false
      if (partidas.length > 0) {
        const jogadas = paraPartidaJogada(partidas)
        if (modo === "barragem_cruzada") {
          decidida =
            estilo === "pares"
              ? resultadoBarragemPares(jogadas).decidida
              : resultadoDaChave(jogadas, {
                  modo: "playoff_acesso",
                  estilo: "extra",
                  vagas: 1,
                  playoffVagas,
                }).decidida
        } else {
          const vagas =
            modo === "playoff_acesso" ? f.vagas_acesso : f.vagas_rebaixamento
          decidida = resultadoDaChave(jogadas, {
            modo,
            estilo: estilo as "vagas" | "extra",
            vagas,
            playoffVagas,
          }).decidida
        }
      }

      return {
        ...base,
        torneioStatus: classificacao.torneio.status,
        partidas,
        decidida,
      }
    })
  )

  const montadas = fronteiras.filter((f) => f.playoffTournamentId !== null)
  const algumaMontada = montadas.length > 0
  // resolvidos = TODA fronteira de playoff tem chave montada e decidida.
  const resolvidos =
    fronteiras.length > 0 && fronteiras.every((f) => f.decidida)

  return {
    temPlayoffs: true,
    algumaMontada,
    resolvidos,
    fronteiras,
  }
}
