import "server-only"

import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Uma PASSAGEM de técnico pela vaga do clube (uma tenure de `coach_tenures`). */
export interface PassagemTecnico {
  /** Conta global do técnico (link para o perfil) — null quando local/removido. */
  userId: string | null
  /**
   * Nome a exibir: nome da conta (user), OU o rótulo local (vaga por-nome), OU
   * null quando a conta foi apagada (estado "técnico removido/anonimizado").
   */
  nome: string | null
  /** true = técnico LOCAL (vaga por-nome, sem conta) → sem link. */
  porNome: boolean
  /** true = conta apagada por cascade (user_id NULL e nome NULL) → "Técnico removido". */
  removido: boolean
  rodadaInicio: number | null
  rodadaFim: number | null
  /** true = tenure ABERTA (vigência = `encerrada_em IS NULL`, marcador autoritativo). */
  vigente: boolean
  /** true = passagem da GRANDE FINAL (decisor, mapeado à season) → ordena por último. */
  decisorFinal: boolean
}

/** Técnicos que comandaram o clube numa temporada, na ordem em que passaram. */
export interface TemporadaTecnicos {
  seasonId: string | null
  /** Número da temporada (1-based) — null quando a season não pôde ser resolvida. */
  numero: number | null
  passagens: PassagemTecnico[]
}

interface CoachTenureRow {
  user_id: string | null
  nome: string | null
  rodada_inicio: number | null
  rodada_fim: number | null
  encerrada_em: string | null
  season_id: string | null
  tournament_id: string
  tecnico: { id: string; nome: string | null } | null
  season: { numero: number } | null
}

/** Chave de dedup por técnico dentro da temporada (null = removido, nunca dedupa). */
function chaveTecnico(row: CoachTenureRow): string | null {
  if (row.user_id != null) return `u:${row.user_id}`
  if (row.nome != null) return `n:${row.nome}`
  return null
}

/**
 * Linha do tempo de TÉCNICOS de um competidor persistente da pirâmide: as
 * PASSAGENS registradas em `coach_tenures`, agrupadas por temporada e ordenadas do
 * mais recente ao mais antigo (dentro da temporada, pela rodada de início; a
 * passagem da grande final vem por último). A VIGÊNCIA é sempre `encerrada_em IS
 * NULL` (nunca `rodada_fim`). A identidade do técnico resolve por join a `users`
 * (não denormalizada); a RLS de `coach_tenures` é a barreira de visibilidade.
 *
 * SPLIT: a tenure da GRANDE FINAL nasce com `season_id NULL` (o `final_tournament_id`
 * está fora de `fn_resolver_season_divisao`). Mapeamos essa tenure de volta à sua
 * season (via `league_division_seasons.final_tournament_id`) para agrupá-la na
 * Temporada N certa e DEDUPLICAR o técnico do finalista (que já aparece na temporada
 * pela Clausura). Tenures decorativas de PLAYOFF/BARRAGEM (também `season_id NULL`,
 * mesmo técnico da vaga regular) que não são grande final são DESCARTADAS — são
 * redundantes com a passagem regular.
 *
 * Estado "técnico removido/anonimizado" (conta apagada → cascade zerou `user_id`,
 * restando `user_id`/`nome` nulos): a passagem entra com `removido = true` e é
 * exibida como "Técnico removido", sem link.
 *
 * Retorna `[]` se o competidor não tem passagens ou em qualquer erro de IO (a
 * seção é secundária; a página degrada sem quebrar).
 */
export async function getTecnicosDoCompetidor(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<TemporadaTecnicos[]> {
  const { data, error } = await supabase
    .from("coach_tenures")
    .select(
      `user_id, nome, rodada_inicio, rodada_fim, encerrada_em, season_id, tournament_id,
       tecnico:users!coach_tenures_user_id_fkey ( id, nome ),
       season:league_seasons!coach_tenures_season_id_fkey ( numero )`
    )
    .eq("competitor_id", competitorId)
  if (error || !data) return []

  const rows = data as unknown as CoachTenureRow[]

  // Mapeia a GRANDE FINAL (tenures com season_id NULL) de volta à sua season, via
  // league_division_seasons.final_tournament_id. Playoff/barragem (também NULL) não
  // casam aqui → descartados abaixo (redundantes com a vaga regular).
  const semSeason = rows.filter((r) => r.season_id == null)
  const finalPorTorneio = new Map<string, { seasonId: string; numero: number | null }>()
  if (semSeason.length > 0) {
    const ids = [...new Set(semSeason.map((r) => r.tournament_id))]
    const { data: divs } = await supabase
      .from("league_division_seasons")
      .select(
        `final_tournament_id, season_id,
         season:league_seasons!league_division_seasons_season_id_fkey ( numero )`
      )
      .in("final_tournament_id", ids)
    for (const d of (divs ?? []) as unknown as {
      final_tournament_id: string | null
      season_id: string | null
      season: { numero: number } | null
    }[]) {
      if (d.final_tournament_id && d.season_id) {
        finalPorTorneio.set(d.final_tournament_id, {
          seasonId: d.season_id,
          numero: d.season?.numero ?? null,
        })
      }
    }
  }

  // Resolve (seasonId, numero, decisorFinal) por tenure. Turno regular usa a
  // própria season; grande final usa a mapeada; playoff/barragem sem mapa → drop.
  interface Resolvida {
    seasonId: string
    numero: number | null
    decisorFinal: boolean
    row: CoachTenureRow
  }
  const resolvidas: Resolvida[] = []
  for (const row of rows) {
    if (row.season_id != null) {
      resolvidas.push({
        seasonId: row.season_id,
        numero: row.season?.numero ?? null,
        decisorFinal: false,
        row,
      })
      continue
    }
    const mapeada = finalPorTorneio.get(row.tournament_id)
    if (mapeada) {
      resolvidas.push({
        seasonId: mapeada.seasonId,
        numero: mapeada.numero,
        decisorFinal: true,
        row,
      })
    }
    // Sem mapa (playoff/barragem): descartada.
  }

  // Agrupa por season. Processa REGULARES antes das decisoras (grande final) para
  // que a dedup do técnico mantenha a passagem regular (rodadas do turno) e descarte
  // a duplicata da final; um técnico DISTINTO na final entra como passagem própria.
  resolvidas.sort((a, b) => Number(a.decisorFinal) - Number(b.decisorFinal))

  const porTemporada = new Map<string, TemporadaTecnicos>()
  const vistosPorTemporada = new Map<string, Set<string>>()
  for (const r of resolvidas) {
    let grupo = porTemporada.get(r.seasonId)
    if (!grupo) {
      grupo = { seasonId: r.seasonId, numero: r.numero, passagens: [] }
      porTemporada.set(r.seasonId, grupo)
      vistosPorTemporada.set(r.seasonId, new Set())
    }
    const vistos = vistosPorTemporada.get(r.seasonId)!
    const chave = chaveTecnico(r.row)
    // Dedup por técnico na temporada (removido = chave null, nunca dedupa).
    if (chave != null && vistos.has(chave)) continue
    if (chave != null) vistos.add(chave)

    const temConta = r.row.user_id != null
    grupo.passagens.push({
      userId: r.row.user_id,
      nome: temConta ? (r.row.tecnico?.nome ?? null) : r.row.nome,
      porNome: r.row.user_id == null && r.row.nome != null,
      removido: r.row.user_id == null && r.row.nome == null,
      rodadaInicio: r.row.rodada_inicio,
      rodadaFim: r.row.rodada_fim,
      vigente: r.row.encerrada_em == null,
      decisorFinal: r.decisorFinal,
    })
  }

  // Passagens: regulares por rodada de início (nulo = início da temporada, antes);
  // a passagem da grande final (decisor) sempre por último.
  for (const grupo of porTemporada.values()) {
    grupo.passagens.sort((a, b) => {
      if (a.decisorFinal !== b.decisorFinal) return a.decisorFinal ? 1 : -1
      return (a.rodadaInicio ?? -1) - (b.rodadaInicio ?? -1)
    })
  }

  // Temporadas: mais recente primeiro (numero desc); numero nulo ao fim.
  return [...porTemporada.values()].sort((a, b) => {
    if (a.numero == null) return 1
    if (b.numero == null) return -1
    return b.numero - a.numero
  })
}
