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

interface FronteiraEmbed {
  nivel_superior: number
  modo: string
  playoff_estilo: string | null
  playoff_vagas: number | null
  vagas_acesso: number
  vagas_rebaixamento: number
  playoff_ida_e_volta: boolean
  playoff_tournament_id: string | null
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
 * chaves montadas) para a página da temporada. Posse por FILTRO transitivo
 * (`league_competitions.created_by = user`) + RLS como 2ª barreira: temporada de
 * liga alheia (ou inexistente) → estado vazio (`temPlayoffs: false`).
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
  userId: string
): Promise<PlayoffsTemporada> {
  const supabase = await createClient()
  const vazio: PlayoffsTemporada = {
    temPlayoffs: false,
    algumaMontada: false,
    resolvidos: false,
    fronteiras: [],
  }

  // Posse por FILTRO transitivo (fronteira → season → competition.created_by).
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select(
      `id,
       league_competitions!inner ( created_by ),
       league_boundaries ( nivel_superior, modo, playoff_estilo, playoff_vagas, vagas_acesso, vagas_rebaixamento, playoff_ida_e_volta, playoff_tournament_id )`
    )
    .eq("id", seasonId)
    .eq("league_competitions.created_by", userId)
    .maybeSingle()

  if (seasonError) {
    throw new Error(`Falha ao carregar os playoffs: ${seasonError.message}`)
  }
  if (!season) {
    return vazio
  }

  const linha = season as unknown as {
    league_boundaries: FronteiraEmbed[]
  }

  // Só as fronteiras de playoff/playout (modo ≠ 'direto'), ordenadas por nível.
  const playoffBoundaries = (linha.league_boundaries ?? [])
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
