import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import {
  computeStandings,
  type LinhaClassificacao,
} from "@/features/standings/computeStandings"
import type {
  MatchStatus,
  TournamentFormat,
  TournamentStatus,
} from "@/lib/supabase/database.types"

export interface TorneioClassificacao {
  id: string
  titulo: string
  status: TournamentStatus
  /** Formato do torneio — gerado (liga/mata-mata) habilita painel de início. */
  formato: TournamentFormat
  ida_e_volta: boolean
  /** Disputa de 3º lugar (só significativo em mata-mata). */
  terceiro_lugar: boolean
  /** Dono do torneio (anulável: semeados/legados) — habilita o console do dono. */
  created_by: string | null
  pontos_vitoria: number
  pontos_empate: number
  pontos_derrota: number
}

export interface LinhaComNome extends LinhaClassificacao {
  nome: string
}

/** Partida encerrada shaped para o histórico (registro fiel, com fallbacks). */
export interface PartidaEncerrada {
  id: string
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  /** Aproximação de "encerrada em": último lançamento (`updated_at`). */
  encerradaEm: string
  /** Rodada/fase gerada; null em partida avulsa (sem rótulo na UI). */
  rodada: number | null
  /** Perna do confronto ida-e-volta de mata-mata (1|2); null fora dele. */
  perna: number | null
}

/** Partida ainda não encerrada — console do dono (encerrar) e contexto. */
export interface PartidaAberta {
  id: string
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  status: MatchStatus
  /** Rodada/fase gerada; null em partida avulsa (sem rótulo na UI). */
  rodada: number | null
  /** Perna do confronto ida-e-volta de mata-mata (1|2); null fora dele. */
  perna: number | null
}

/** Partida da chave de mata-mata (rodada e posicao presentes) — bracket. */
export interface PartidaDaChave {
  id: string
  rodada: number
  posicao: number
  perna: number | null
  participante_1: string | null
  participante_2: string | null
  nome_1: string
  nome_2: string
  placar_1: number
  placar_2: number
  status: MatchStatus
}

export interface ClassificacaoTorneio {
  torneio: TorneioClassificacao
  linhas: LinhaComNome[]
  partidasEncerradas: PartidaEncerrada[]
  /** Classificação de clubes: mesmo motor, chaveado por time_1/time_2. */
  clubes: LinhaComNome[]
  partidasAbertas: PartidaAberta[]
  /** Chave do mata-mata (vazia fora dele) — MESMO snapshot das demais. */
  chave: PartidaDaChave[]
}

interface ParticipanteEmbed {
  id: string
  nome: string | null
}

interface ClubeEmbed {
  id: string
  nome: string
}

interface PartidaComNomes {
  id: string
  participante_1: string | null
  participante_2: string | null
  time_1: string | null
  time_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  rodada: number | null
  posicao: number | null
  perna: number | null
  created_at: string
  updated_at: string
  p1: ParticipanteEmbed | null
  p2: ParticipanteEmbed | null
  t1: ClubeEmbed | null
  t2: ClubeEmbed | null
}

/** Mesmo fallback do MatchCard para participante sem nome. */
function nomeOuFallback(nome: string | null | undefined): string {
  return nome?.trim() || "Sem nome"
}

/**
 * Nome de um LADO do histórico: lado vazio é "A definir" (fallback do
 * MatchCard) — diferente do motor, o histórico REGISTRA a partida como ela é.
 */
function nomeDoLado(embed: ParticipanteEmbed | null): string {
  return embed ? nomeOuFallback(embed.nome) : "A definir"
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
    .select(
      "id, titulo, status, formato, ida_e_volta, terceiro_lugar, created_by, pontos_vitoria, pontos_empate, pontos_derrota"
    )
    .eq("id", tournamentId)
    .maybeSingle()

  if (torneioError) {
    throw new Error(`Falha ao carregar o torneio: ${torneioError.message}`)
  }
  if (!torneio) {
    return null
  }

  // Ordenadas por updated_at desc para o histórico (encerradas mais recentes
  // primeiro); o motor é insensível à ordem (acumuladores comutativos).
  const { data: partidas, error: partidasError } = await supabase
    .from("matches")
    .select(
      `id, participante_1, participante_2, time_1, time_2, placar_1, placar_2, status, rodada, posicao, perna, created_at, updated_at,
       p1:users!matches_participante_1_fkey ( id, nome ),
       p2:users!matches_participante_2_fkey ( id, nome ),
       t1:teams!matches_time_1_fkey ( id, nome ),
       t2:teams!matches_time_2_fkey ( id, nome )`
    )
    .eq("tournament_id", tournamentId)
    .order("updated_at", { ascending: false })

  if (partidasError) {
    throw new Error(`Falha ao carregar as partidas: ${partidasError.message}`)
  }

  // Embeds to-one chegam como objeto único; o tipo explícito é a fonte de
  // verdade nesta fronteira de confiança (mesma decisão de getActiveMatches).
  const linhasPartidas = (partidas ?? []) as unknown as PartidaComNomes[]

  const nomes = new Map<string, string>()
  const nomesClubes = new Map<string, string>()
  for (const p of linhasPartidas) {
    if (p.p1) nomes.set(p.p1.id, nomeOuFallback(p.p1.nome))
    if (p.p2) nomes.set(p.p2.id, nomeOuFallback(p.p2.nome))
    if (p.t1) nomesClubes.set(p.t1.id, nomeOuFallback(p.t1.nome))
    if (p.t2) nomesClubes.set(p.t2.id, nomeOuFallback(p.t2.nome))
  }

  const regras = {
    vitoria: torneio.pontos_vitoria,
    empate: torneio.pontos_empate,
    derrota: torneio.pontos_derrota,
  }

  const linhas = computeStandings(regras, linhasPartidas).map((linha) => ({
    ...linha,
    nome: nomes.get(linha.participanteId) ?? "Sem nome",
  }))

  // Terceira projeção: o motor é agnóstico ao significado do id — re-chavear
  // os lados por CLUBE produz a classificação de clubes de graça. Partida sem
  // os dois clubes vira lado nulo → inelegível (não há confronto de clubes).
  const clubes = computeStandings(
    regras,
    linhasPartidas.map((p) => ({
      participante_1: p.time_1,
      participante_2: p.time_2,
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      status: p.status,
    }))
  ).map((linha) => ({
    ...linha,
    nome: nomesClubes.get(linha.participanteId) ?? "Sem nome",
  }))

  // Bye de chave (mata-mata): partida com slot e um lado vazio — avanço
  // direto, não um jogo. Fica FORA do histórico e das abertas ("João 0 x 0
  // A definir" seria ruído); a chave (BracketView) o exibe como avanço.
  // `typeof === "number"` (e não `!== null`): nesta fronteira de cast um
  // shape sem a coluna viraria bye silenciosamente.
  const ehByeDeChave = (p: PartidaComNomes) =>
    typeof p.posicao === "number" &&
    (p.participante_1 === null || p.participante_2 === null)

  // Segunda projeção do MESMO snapshot: o histórico registra toda encerrada
  // (inclusive sem participante — diferente do motor, que exige os dois lados).
  const partidasEncerradas = linhasPartidas
    .filter((p) => p.status === "encerrada" && !ehByeDeChave(p))
    .map((p) => ({
      id: p.id,
      nome_1: nomeDoLado(p.p1),
      nome_2: nomeDoLado(p.p2),
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      encerradaEm: p.updated_at,
      rodada: p.rodada,
      perna: p.perna,
    }))

  // Quarta projeção: em aberto (console do dono — encerrar). `!==` falha-segura:
  // status novo aparece como "em aberto" em vez de sumir. Ordem: RODADA asc
  // primeiro (ordem natural de disputa da liga; null = avulsa, fica depois),
  // slot/perna em seguida (chave do mata-mata em ordem de disputa) e
  // created_at ASC como desempate ESTÁVEL — a query ordena por updated_at
  // (pensada pro histórico) e reordenaria as abertas a cada lançamento de
  // placar (mesma decisão do dashboard em getActiveMatches).
  const partidasAbertas = linhasPartidas
    .filter((p) => p.status !== "encerrada" && !ehByeDeChave(p))
    .sort((a, b) => {
      if (a.rodada !== b.rodada) {
        if (a.rodada === null) return 1
        if (b.rodada === null) return -1
        return a.rodada - b.rodada
      }
      if (a.posicao !== b.posicao) {
        return (a.posicao ?? 0) - (b.posicao ?? 0)
      }
      if (a.perna !== b.perna) {
        return (a.perna ?? 0) - (b.perna ?? 0)
      }
      return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
    })
    .map((p) => ({
      id: p.id,
      nome_1: nomeDoLado(p.p1),
      nome_2: nomeDoLado(p.p2),
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      status: p.status,
      rodada: p.rodada,
      perna: p.perna,
    }))

  // Quinta projeção: a CHAVE do mata-mata (partidas com rodada e slot) —
  // insumo do BracketView. Vazia fora do mata-mata (nenhuma partida tem slot).
  const chave = linhasPartidas
    .filter(
      (p): p is PartidaComNomes & { rodada: number; posicao: number } =>
        typeof p.rodada === "number" && typeof p.posicao === "number"
    )
    .map((p) => ({
      id: p.id,
      rodada: p.rodada,
      posicao: p.posicao,
      perna: p.perna,
      participante_1: p.participante_1,
      participante_2: p.participante_2,
      nome_1: nomeDoLado(p.p1),
      nome_2: nomeDoLado(p.p2),
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      status: p.status,
    }))
    .sort(
      (a, b) =>
        a.rodada - b.rodada || a.posicao - b.posicao || (a.perna ?? 0) - (b.perna ?? 0)
    )

  return { torneio, linhas, partidasEncerradas, clubes, partidasAbertas, chave }
})
