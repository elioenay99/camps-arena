import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um clube que o técnico comandou (agregado por competidor persistente). */
export interface ClubeComandado {
  competitorId: string
  nome: string
  escudoUrl: string | null
  competitionId: string
  competitionNome: string
  /** Temporadas distintas em que comandou este clube (com season âncora). */
  temporadas: number
  /** true = tem uma passagem ABERTA neste clube (`encerrada_em IS NULL`). */
  vigente: boolean
}

/** Perfil global de um TÉCNICO (usuário), agregando as tenures com conta. */
export interface TecnicoPerfil {
  id: string
  nome: string
  clubes: ClubeComandado[]
  totalClubes: number
  /** Total de temporadas distintas comandadas (soma por clube). */
  totalTemporadas: number
}

interface TenureComClube {
  competitor_id: string
  season_id: string | null
  encerrada_em: string | null
  competitor: {
    id: string
    rotulo: string | null
    team: { nome: string | null; escudo_url: string | null } | null
    competition: { id: string; nome: string } | null
  } | null
}

/**
 * Perfil GLOBAL de um técnico (por `users.id`): identidade + os clubes que
 * comandou ao longo das ligas, agregados por competidor persistente. Considera
 * SOMENTE tenures com conta (`user_id NOT NULL`) — passagens LOCAIS (vaga
 * por-nome) e o estado anonimizado (conta apagada) não compõem o perfil global
 * (decisão do dono: técnico local não vira conta agregável). A VIGÊNCIA é sempre
 * `encerrada_em IS NULL`.
 *
 * Visibilidade: a identidade vem de `users` (RLS `users_select_authenticated` =
 * qualquer logado); as tenures/competições respeitam a RLS de `coach_tenures`
 * (competição ativa / dono / bastidores). Retorna `null` quando o usuário não
 * existe ou não é legível (ex.: anônimo) — a rota vira 404. Um técnico REAL sem
 * histórico VISÍVEL retorna um perfil com `clubes: []` (estado vazio na página),
 * sem 404, para não quebrar links vindos da classificação.
 */
export async function getTecnicoProfile(
  supabase: ServerClient,
  { userId }: { userId: string }
): Promise<TecnicoPerfil | null> {
  // Identidade (gate de existência/visibilidade). Sem row → null → 404.
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, nome")
    .eq("id", userId)
    .maybeSingle()
  if (userError || !user) return null

  const { data, error } = await supabase
    .from("coach_tenures")
    .select(
      `competitor_id, season_id, encerrada_em,
       competitor:league_competitors!coach_tenures_competitor_id_fkey (
         id, rotulo,
         team:teams ( nome, escudo_url ),
         competition:league_competitions ( id, nome )
       )`
    )
    .eq("user_id", userId)

  const tenures = (error || !data ? [] : (data as unknown as TenureComClube[]))

  // Agrega por competidor: nome/escudo/competição + temporadas distintas + vigência.
  const porClube = new Map<
    string,
    ClubeComandado & { _seasons: Set<string> }
  >()
  for (const t of tenures) {
    const comp = t.competitor
    if (!comp || !comp.competition) continue
    let clube = porClube.get(t.competitor_id)
    if (!clube) {
      const porNome = comp.rotulo != null
      clube = {
        competitorId: t.competitor_id,
        nome: porNome ? (comp.rotulo as string) : (comp.team?.nome ?? "Competidor"),
        escudoUrl: porNome ? null : (comp.team?.escudo_url ?? null),
        competitionId: comp.competition.id,
        competitionNome: comp.competition.nome,
        temporadas: 0,
        vigente: false,
        _seasons: new Set<string>(),
      }
      porClube.set(t.competitor_id, clube)
    }
    if (t.season_id) clube._seasons.add(t.season_id)
    if (t.encerrada_em == null) clube.vigente = true
  }

  const clubes: ClubeComandado[] = [...porClube.values()]
    .map(({ _seasons, ...c }) => ({ ...c, temporadas: _seasons.size }))
    // Vigentes primeiro; depois por nome.
    .sort((a, b) => {
      if (a.vigente !== b.vigente) return a.vigente ? -1 : 1
      return a.nome.localeCompare(b.nome, "pt-BR")
    })

  return {
    id: user.id,
    nome: user.nome?.trim() || "Técnico",
    clubes,
    totalClubes: clubes.length,
    totalTemporadas: clubes.reduce((s, c) => s + c.temporadas, 0),
  }
}
