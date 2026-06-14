import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import type { LeagueSeasonStatus } from "@/features/league/leagueStatus"

/** Identidade exibível de um competidor persistente (clube OU rótulo livre). */
export interface CompetidorIdentidade {
  id: string
  nome: string
  escudoUrl: string | null
  avatarUrl: string | null
}

/** Uma divisão da temporada (= um torneio de liga). */
export interface DivisaoTemporada {
  id: string
  nivel: number
  nome: string
  porNome: boolean
  desempate: string
  tamanho: number
  /** Torneio da divisão = APERTURA — null enquanto a temporada é rascunho. */
  tournamentId: string | null
  /** Torneio da CLAUSURA (Fase 5.1) — null fora do split. */
  tournamentIdClausura: string | null
  /** Torneio da GRANDE FINAL (Fase 5.1) — null até a final ser montada. */
  finalTournamentId: string | null
  /** Cor PRÓPRIA da divisão (change add-cores-campeonato): null = herda a da
   * competição. A página resolve `divisão.cor ?? competição.cor` por card. */
  corPrimaria: string | null
  corSecundaria: string | null
}

/** Fronteira sobe/cai entre `nivelSuperior` (d) e a divisão de baixo (d+1). */
export interface FronteiraTemporada {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
}

/** Temporada completa para a página /dashboard/ligas/[id]. */
export interface TemporadaCompleta {
  /** Id da temporada (= o `[id]` da rota). */
  seasonId: string
  numero: number
  status: LeagueSeasonStatus
  /** Ciclo da temporada (Fase 5.1): 'anual' | 'apertura_clausura'. */
  ciclo: string
  competicao: {
    id: string
    nome: string
    /** Cores DEFAULT da pirâmide (change add-cores-campeonato): herança das
     * divisões sem cor própria + cor do header/seções cross-divisão. null = base. */
    corPrimaria: string | null
    corSecundaria: string | null
  }
  /** Divisões ordenadas por nível ascendente (1 = topo). */
  divisoes: DivisaoTemporada[]
  fronteiras: FronteiraTemporada[]
  /** Identidade por id de competidor (resolvida no servidor) — alimenta o
   * FluxoTemporadaPanel e a página. */
  competidores: Record<string, CompetidorIdentidade>
}

interface DivisaoEmbed {
  id: string
  nivel: number
  nome: string
  por_nome: boolean
  desempate: string
  tamanho: number
  tournament_id: string | null
  tournament_id_clausura: string | null
  final_tournament_id: string | null
  cor_primaria: string | null
  cor_secundaria: string | null
}

interface FronteiraEmbed {
  nivel_superior: number
  vagas_acesso: number
  vagas_rebaixamento: number
}

interface CompetidorEmbed {
  id: string
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
  holder: { nome: string | null; avatar: string | null } | null
}

/** Nome exibível de um competidor: clube tem prioridade, senão o rótulo livre. */
function nomeDoCompetidor(c: CompetidorEmbed): string {
  const nome = c.team?.nome ?? c.rotulo
  return nome?.trim() || "Sem nome"
}

/**
 * Carrega a temporada de uma pirâmide (config + divisões + fronteiras +
 * identidade dos competidores) para a página da temporada. Posse por FILTRO
 * transitivo (`league_competitions.created_by = user`) + RLS como 2ª barreira:
 * temporada de liga alheia (ou inexistente) → `null` (a página converte em
 * notFound; resposta única, sem oráculo de existência).
 *
 * Resolve a identidade dos competidores DA PIRÂMIDE (clube → nome/escudo; rótulo
 * livre; técnico → avatar) num único embed — o FluxoTemporadaPanel e a tabela
 * recebem os rótulos já prontos, sem buscar dados no cliente.
 *
 * `cache()` (React): generateMetadata e a page compartilham o resultado na
 * MESMA requisição — uma viagem ao banco, não duas.
 */
export const getSeason = cache(async function getSeason(
  seasonId: string,
  userId: string
): Promise<TemporadaCompleta | null> {
  const supabase = await createClient()

  // Temporada + pirâmide (posse por filtro) + divisões + fronteiras num só hop.
  const { data: season, error: seasonError } = await supabase
    .from("league_seasons")
    .select(
      `id, numero, status, ciclo,
       competition:league_competitions!inner ( id, nome, created_by, cor_primaria, cor_secundaria ),
       league_division_seasons ( id, nivel, nome, por_nome, desempate, tamanho, tournament_id, tournament_id_clausura, final_tournament_id, cor_primaria, cor_secundaria ),
       league_boundaries ( nivel_superior, vagas_acesso, vagas_rebaixamento )`
    )
    .eq("id", seasonId)
    // Embed aliasado: o filtro usa o ALIAS (`competition`), não o nome da tabela
    // (PostgREST resolve a relação pelo apelido — ver getVagasDoTorneio).
    .eq("competition.created_by", userId)
    .maybeSingle()

  if (seasonError) {
    throw new Error(`Falha ao carregar a temporada: ${seasonError.message}`)
  }
  if (!season) {
    return null
  }

  const linha = season as unknown as {
    id: string
    numero: number
    status: LeagueSeasonStatus
    ciclo: string
    competition: {
      id: string
      nome: string
      created_by: string | null
      cor_primaria: string | null
      cor_secundaria: string | null
    }
    league_division_seasons: DivisaoEmbed[]
    league_boundaries: FronteiraEmbed[]
  }

  // Identidade dos competidores da PIRÂMIDE (uma query separada — o competidor
  // pertence à competição, não à temporada; alcança todas as divisões).
  const { data: competidoresRaw, error: compsError } = await supabase
    .from("league_competitors")
    .select(
      `id, rotulo,
       team:teams ( nome, escudo_url ),
       holder:users!league_competitors_holder_user_id_fkey ( nome, avatar )`
    )
    .eq("competition_id", linha.competition.id)

  if (compsError) {
    throw new Error(`Falha ao carregar os competidores: ${compsError.message}`)
  }

  const competidores: Record<string, CompetidorIdentidade> = {}
  for (const c of (competidoresRaw ?? []) as unknown as CompetidorEmbed[]) {
    competidores[c.id] = {
      id: c.id,
      nome: nomeDoCompetidor(c),
      escudoUrl: c.team?.escudo_url ?? null,
      avatarUrl: c.holder?.avatar ?? null,
    }
  }

  const divisoes: DivisaoTemporada[] = [...linha.league_division_seasons]
    .sort((a, b) => a.nivel - b.nivel)
    .map((d) => ({
      id: d.id,
      nivel: d.nivel,
      nome: d.nome,
      porNome: d.por_nome,
      desempate: d.desempate,
      tamanho: d.tamanho,
      tournamentId: d.tournament_id,
      tournamentIdClausura: d.tournament_id_clausura,
      finalTournamentId: d.final_tournament_id,
      corPrimaria: d.cor_primaria,
      corSecundaria: d.cor_secundaria,
    }))

  const fronteiras: FronteiraTemporada[] = [...linha.league_boundaries]
    .sort((a, b) => a.nivel_superior - b.nivel_superior)
    .map((f) => ({
      nivelSuperior: f.nivel_superior,
      vagasAcesso: f.vagas_acesso,
      vagasRebaixamento: f.vagas_rebaixamento,
    }))

  return {
    seasonId: linha.id,
    numero: linha.numero,
    status: linha.status,
    ciclo: linha.ciclo,
    competicao: {
      id: linha.competition.id,
      nome: linha.competition.nome,
      corPrimaria: linha.competition.cor_primaria,
      corSecundaria: linha.competition.cor_secundaria,
    },
    divisoes,
    fronteiras,
    competidores,
  }
})
