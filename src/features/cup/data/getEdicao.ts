import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"

import type {
  CupCompetitionStatus,
  CupFormat,
  CupSeasonStatus,
  TournamentStatus,
} from "@/lib/supabase/database.types"

/** Um participante (cup_entry) resolvido para exibição. */
export interface ParticipanteEdicao {
  id: string
  teamId: string | null
  rotulo: string | null
  /** Nome exibível: clube tem prioridade, senão o rótulo livre. */
  nome: string
  escudoUrl: string | null
  origemRuleId: string | null
  origemSeasonId: string | null
  origemDescricao: string | null
  seed: number | null
  posicaoFinal: number | null
  slotId: string | null
  manual: boolean
}

/** Uma identidade excluída (re-derivação). */
export interface ExclusaoEdicao {
  id: string
  teamId: string | null
  rotulo: string | null
}

/** Edição completa para a página /dashboard/copas/edicao/[id]. */
export interface EdicaoCompleta {
  id: string
  numero: number
  status: CupSeasonStatus
  tournamentId: string | null
  /** Status do torneio materializado (null se ainda não montada). */
  tournamentStatus: TournamentStatus | null
  configSnapshot: import("@/lib/supabase/database.types").Json | null
  previousSeasonId: string | null
  montadaEm: string | null
  encerradaEm: string | null
  copa: {
    id: string
    nome: string
    formato: CupFormat
    porNome: boolean
    status: CupCompetitionStatus
    qtdGrupos: number | null
    classificadosPorGrupo: number | null
    /** Dono da copa (`created_by`). Gateia ações dono-only na UI. */
    criadaPor: string | null
    corPrimaria: string | null
    corSecundaria: string | null
  }
  /** Participantes ordenados por seed ascendente (1 = mais forte). */
  participantes: ParticipanteEdicao[]
  /** Identidades excluídas (persistem na re-derivação). */
  exclusoes: ExclusaoEdicao[]
}

interface EntryEmbed {
  id: string
  team_id: string | null
  rotulo: string | null
  origem_rule_id: string | null
  origem_season_id: string | null
  origem_descricao: string | null
  seed: number | null
  posicao_final: number | null
  slot_id: string | null
  manual: boolean
}

/**
 * Carrega uma edição (config-mãe + entries + status + torneio + exclusões) para a
 * PÁGINA DA EDIÇÃO. Leitura governada pela RLS via copa-mãe; edição invisível →
 * `null`. Resolve o nome/escudo dos clubes das entries num embed só, e o status do
 * torneio materializado (para gatear iniciar/encerrar).
 *
 * `cache()` (React): metadata e page compartilham na MESMA requisição.
 */
export const getEdicao = cache(async function getEdicao(
  cupSeasonId: string
): Promise<EdicaoCompleta | null> {
  const supabase = await createClient()

  const { data: edicao, error: edicaoError } = await supabase
    .from("cup_seasons")
    .select(
      `id, numero, status, tournament_id, config_snapshot, previous_season_id, montada_em, encerrada_em,
       cup_competitions!inner ( id, nome, formato, por_nome, status, qtd_grupos, classificados_por_grupo, created_by, cor_primaria, cor_secundaria ),
       cup_entries ( id, team_id, rotulo, origem_rule_id, origem_season_id, origem_descricao, seed, posicao_final, slot_id, manual ),
       cup_season_exclusions ( id, team_id, rotulo )`
    )
    .eq("id", cupSeasonId)
    .maybeSingle()

  if (edicaoError) {
    throw new Error(`Falha ao carregar a edição: ${edicaoError.message}`)
  }
  if (!edicao) {
    return null
  }

  const linha = edicao as unknown as {
    id: string
    numero: number
    status: CupSeasonStatus
    tournament_id: string | null
    config_snapshot: import("@/lib/supabase/database.types").Json | null
    previous_season_id: string | null
    montada_em: string | null
    encerrada_em: string | null
    cup_competitions: {
      id: string
      nome: string
      formato: CupFormat
      por_nome: boolean
      status: CupCompetitionStatus
      qtd_grupos: number | null
      classificados_por_grupo: number | null
      created_by: string | null
      cor_primaria: string | null
      cor_secundaria: string | null
    }
    cup_entries: EntryEmbed[]
    cup_season_exclusions: { id: string; team_id: string | null; rotulo: string | null }[]
  }

  // Status do torneio materializado (gateia iniciar/encerrar).
  let tournamentStatus: TournamentStatus | null = null
  if (linha.tournament_id) {
    const { data: torneio } = await supabase
      .from("tournaments")
      .select("status")
      .eq("id", linha.tournament_id)
      .maybeSingle()
    tournamentStatus = (torneio?.status as TournamentStatus | undefined) ?? null
  }

  // Resolve nome/escudo dos clubes das entries (um embed só).
  const teamIds = [
    ...new Set(
      linha.cup_entries.map((e) => e.team_id).filter((id): id is string => id != null)
    ),
  ]
  const teamPorId = new Map<string, { nome: string | null; escudo_url: string | null }>()
  if (teamIds.length > 0) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, nome, escudo_url")
      .in("id", teamIds)
    for (const t of teams ?? []) teamPorId.set(t.id, { nome: t.nome, escudo_url: t.escudo_url })
  }

  const participantes: ParticipanteEdicao[] = [...linha.cup_entries]
    .sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER))
    .map((e) => {
      const team = e.team_id ? teamPorId.get(e.team_id) : undefined
      const nome = (team?.nome ?? e.rotulo)?.trim() || "Sem nome"
      return {
        id: e.id,
        teamId: e.team_id,
        rotulo: e.rotulo,
        nome,
        escudoUrl: team?.escudo_url ?? null,
        origemRuleId: e.origem_rule_id,
        origemSeasonId: e.origem_season_id,
        origemDescricao: e.origem_descricao,
        seed: e.seed,
        posicaoFinal: e.posicao_final,
        slotId: e.slot_id,
        manual: e.manual,
      }
    })

  const exclusoes: ExclusaoEdicao[] = linha.cup_season_exclusions.map((x) => ({
    id: x.id,
    teamId: x.team_id,
    rotulo: x.rotulo,
  }))

  return {
    id: linha.id,
    numero: linha.numero,
    status: linha.status,
    tournamentId: linha.tournament_id,
    tournamentStatus,
    configSnapshot: linha.config_snapshot,
    previousSeasonId: linha.previous_season_id,
    montadaEm: linha.montada_em,
    encerradaEm: linha.encerrada_em,
    copa: {
      id: linha.cup_competitions.id,
      nome: linha.cup_competitions.nome,
      formato: linha.cup_competitions.formato,
      porNome: linha.cup_competitions.por_nome,
      status: linha.cup_competitions.status,
      qtdGrupos: linha.cup_competitions.qtd_grupos,
      classificadosPorGrupo: linha.cup_competitions.classificados_por_grupo,
      criadaPor: linha.cup_competitions.created_by,
      corPrimaria: linha.cup_competitions.cor_primaria,
      corSecundaria: linha.cup_competitions.cor_secundaria,
    },
    participantes,
    exclusoes,
  }
})
