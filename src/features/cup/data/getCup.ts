import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

import type {
  CupCompetitionStatus,
  CupFormat,
  CupOriginType,
  CupScope,
  CupSeasonStatus,
} from "@/lib/supabase/database.types"

/** Uma regra de qualificação resolvida para exibição (com nomes da origem). */
export interface RegraCopa {
  id: string
  origemTipo: CupOriginType
  origemCompetitionId: string | null
  origemNivel: number | null
  origemCupId: string | null
  posicaoInicio: number
  posicaoFim: number
  prioridade: number
  rotulo: string | null
  /** Nome legível da origem (pirâmide/copa), resolvido no servidor. */
  origemNome: string | null
}

/** Uma edição da copa para a lista na página da copa. */
export interface EdicaoResumo {
  id: string
  numero: number
  status: CupSeasonStatus
  tournamentId: string | null
  previousSeasonId: string | null
  montadaEm: string | null
  encerradaEm: string | null
}

/** Copa completa para a página /dashboard/copas/[id]. */
export interface CopaCompleta {
  id: string
  nome: string
  abrangencia: CupScope
  formato: CupFormat
  status: CupCompetitionStatus
  porNome: boolean
  idaEVolta: boolean
  terceiroLugar: boolean
  qtdGrupos: number | null
  classificadosPorGrupo: number | null
  desempateCriterio: string
  isPublic: boolean
  corPrimaria: string | null
  corSecundaria: string | null
  /** Dono da copa (`created_by`). Gateia as ações dono-only na UI. */
  criadaPor: string | null
  regras: RegraCopa[]
  /** Edições ordenadas por numero descendente (mais recente primeiro). */
  edicoes: EdicaoResumo[]
}

interface RegraEmbed {
  id: string
  origem_tipo: CupOriginType
  origem_competition_id: string | null
  origem_nivel: number | null
  origem_cup_id: string | null
  posicao_inicio: number
  posicao_fim: number
  prioridade: number
  rotulo: string | null
}

interface EdicaoEmbed {
  id: string
  numero: number
  status: CupSeasonStatus
  tournament_id: string | null
  previous_season_id: string | null
  montada_em: string | null
  encerrada_em: string | null
}

/**
 * Carrega uma copa (config + regras + edições) para a PÁGINA DA COPA. A leitura é
 * governada pela RLS (`is_public or created_by = auth.uid()`); copa invisível →
 * `null` (a página converte em notFound, resposta única sem oráculo). Resolve os
 * NOMES das origens (pirâmide/copa) num par de queries para a UI exibir as regras
 * legíveis sem buscar dados no cliente.
 *
 * `cache()` (React): generateMetadata e a page compartilham o resultado na MESMA
 * requisição — uma viagem ao banco, não duas.
 */
export const getCup = cache(async function getCup(
  cupId: string
): Promise<CopaCompleta | null> {
  const supabase = await createClient()

  const { data: copa, error: copaError } = await supabase
    .from("cup_competitions")
    .select(
      `id, nome, abrangencia, formato, status, por_nome, ida_e_volta, terceiro_lugar,
       qtd_grupos, classificados_por_grupo, desempate_criterio, is_public,
       cor_primaria, cor_secundaria, created_by,
       cup_qualification_rules!cup_qualification_rules_cup_competition_id_fkey ( id, origem_tipo, origem_competition_id, origem_nivel, origem_cup_id, posicao_inicio, posicao_fim, prioridade, rotulo ),
       cup_seasons ( id, numero, status, tournament_id, previous_season_id, montada_em, encerrada_em )`
    )
    .eq("id", cupId)
    .maybeSingle()

  if (copaError) {
    throw new Error(`Falha ao carregar a copa: ${copaError.message}`)
  }
  if (!copa) {
    return null
  }

  const linha = copa as unknown as {
    id: string
    nome: string
    abrangencia: CupScope
    formato: CupFormat
    status: CupCompetitionStatus
    por_nome: boolean
    ida_e_volta: boolean
    terceiro_lugar: boolean
    qtd_grupos: number | null
    classificados_por_grupo: number | null
    desempate_criterio: string
    is_public: boolean
    cor_primaria: string | null
    cor_secundaria: string | null
    created_by: string | null
    cup_qualification_rules: RegraEmbed[]
    cup_seasons: EdicaoEmbed[]
  }

  // Resolve os nomes das origens (pirâmide/copa) — uma query por tipo. A RLS
  // libera os nomes de origens públicas/do dono (alinhado ao consentimento das RPCs).
  const competitionIds = [
    ...new Set(
      linha.cup_qualification_rules
        .map((r) => r.origem_competition_id)
        .filter((id): id is string => id != null)
    ),
  ]
  const cupIds = [
    ...new Set(
      linha.cup_qualification_rules
        .map((r) => r.origem_cup_id)
        .filter((id): id is string => id != null)
    ),
  ]

  const nomePorCompetition = new Map<string, string>()
  if (competitionIds.length > 0) {
    const { data: comps } = await supabase
      .from("league_competitions")
      .select("id, nome")
      .in("id", competitionIds)
    for (const c of comps ?? []) nomePorCompetition.set(c.id, c.nome)
  }
  const nomePorCup = new Map<string, string>()
  if (cupIds.length > 0) {
    const { data: cups } = await supabase
      .from("cup_competitions")
      .select("id, nome")
      .in("id", cupIds)
    for (const c of cups ?? []) nomePorCup.set(c.id, c.nome)
  }

  const regras: RegraCopa[] = [...linha.cup_qualification_rules]
    .sort((a, b) => a.prioridade - b.prioridade || a.posicao_inicio - b.posicao_inicio)
    .map((r) => ({
      id: r.id,
      origemTipo: r.origem_tipo,
      origemCompetitionId: r.origem_competition_id,
      origemNivel: r.origem_nivel,
      origemCupId: r.origem_cup_id,
      posicaoInicio: r.posicao_inicio,
      posicaoFim: r.posicao_fim,
      prioridade: r.prioridade,
      rotulo: r.rotulo,
      origemNome:
        r.origem_tipo === "divisao"
          ? (r.origem_competition_id
              ? (nomePorCompetition.get(r.origem_competition_id) ?? null)
              : null)
          : (r.origem_cup_id ? (nomePorCup.get(r.origem_cup_id) ?? null) : null),
    }))

  const edicoes: EdicaoResumo[] = [...linha.cup_seasons]
    .sort((a, b) => b.numero - a.numero)
    .map((e) => ({
      id: e.id,
      numero: e.numero,
      status: e.status,
      tournamentId: e.tournament_id,
      previousSeasonId: e.previous_season_id,
      montadaEm: e.montada_em,
      encerradaEm: e.encerrada_em,
    }))

  return {
    id: linha.id,
    nome: linha.nome,
    abrangencia: linha.abrangencia,
    formato: linha.formato,
    status: linha.status,
    porNome: linha.por_nome,
    idaEVolta: linha.ida_e_volta,
    terceiroLugar: linha.terceiro_lugar,
    qtdGrupos: linha.qtd_grupos,
    classificadosPorGrupo: linha.classificados_por_grupo,
    desempateCriterio: linha.desempate_criterio,
    isPublic: linha.is_public,
    corPrimaria: linha.cor_primaria,
    corSecundaria: linha.cor_secundaria,
    criadaPor: linha.created_by,
    regras,
    edicoes,
  }
})
