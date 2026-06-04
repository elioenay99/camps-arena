import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import {
  computeStandings,
  type LinhaClassificacao,
} from "@/features/standings/computeStandings"
import type { MatchStatus, TournamentStatus } from "@/lib/supabase/database.types"

export interface TorneioClassificacao {
  id: string
  titulo: string
  status: TournamentStatus
  pontos_vitoria: number
  pontos_empate: number
  pontos_derrota: number
}

export interface LinhaComNome extends LinhaClassificacao {
  nome: string
}

export interface ClassificacaoTorneio {
  torneio: TorneioClassificacao
  linhas: LinhaComNome[]
}

interface ParticipanteEmbed {
  id: string
  nome: string | null
}

interface PartidaComNomes {
  participante_1: string | null
  participante_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  p1: ParticipanteEmbed | null
  p2: ParticipanteEmbed | null
}

/** Mesmo fallback do MatchCard para participante sem nome. */
function nomeOuFallback(nome: string | null | undefined): string {
  return nome?.trim() || "Sem nome"
}

/**
 * Busca o torneio (regras de pontuação) e as partidas dele, roda o motor puro
 * e devolve a classificação com nomes resolvidos.
 *
 * - Torneio invisível pela RLS (privado de terceiro) ou inexistente → `null`
 *   (a página converte em notFound; resposta única, sem oráculo de existência).
 * - A query de partidas seleciona a COLUNA `participante_*` (uuid, insumo do
 *   motor) E o embed aliased com o nome (insumo do mapa) — suportado pelo
 *   PostgREST na mesma query, com FK-hint explícito para desambiguar os dois
 *   relacionamentos matches→users (padrão de getActiveMatches).
 * - Se o torneio é visível, a RLS de matches devolve TODAS as partidas dele
 *   (a cláusula de torneio da policy cobre; a de participante só adiciona) —
 *   a classificação nunca é calculada com subconjunto.
 * - `cache()` (React): generateMetadata e a page compartilham o resultado na
 *   MESMA requisição — uma viagem ao banco, não duas.
 */
export const getTournamentClassificacao = cache(async function getTournamentClassificacao(
  tournamentId: string
): Promise<ClassificacaoTorneio | null> {
  const supabase = await createClient()

  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id, titulo, status, pontos_vitoria, pontos_empate, pontos_derrota")
    .eq("id", tournamentId)
    .maybeSingle()

  if (torneioError) {
    throw new Error(`Falha ao carregar o torneio: ${torneioError.message}`)
  }
  if (!torneio) {
    return null
  }

  const { data: partidas, error: partidasError } = await supabase
    .from("matches")
    .select(
      `participante_1, participante_2, placar_1, placar_2, status,
       p1:users!matches_participante_1_fkey ( id, nome ),
       p2:users!matches_participante_2_fkey ( id, nome )`
    )
    .eq("tournament_id", tournamentId)

  if (partidasError) {
    throw new Error(`Falha ao carregar as partidas: ${partidasError.message}`)
  }

  // Embeds to-one chegam como objeto único; o tipo explícito é a fonte de
  // verdade nesta fronteira de confiança (mesma decisão de getActiveMatches).
  const linhasPartidas = (partidas ?? []) as unknown as PartidaComNomes[]

  const nomes = new Map<string, string>()
  for (const p of linhasPartidas) {
    if (p.p1) nomes.set(p.p1.id, nomeOuFallback(p.p1.nome))
    if (p.p2) nomes.set(p.p2.id, nomeOuFallback(p.p2.nome))
  }

  const linhas = computeStandings(
    {
      vitoria: torneio.pontos_vitoria,
      empate: torneio.pontos_empate,
      derrota: torneio.pontos_derrota,
    },
    linhasPartidas
  ).map((linha) => ({
    ...linha,
    nome: nomes.get(linha.participanteId) ?? "Sem nome",
  }))

  return { torneio, linhas }
})
