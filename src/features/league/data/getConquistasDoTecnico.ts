import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type {
  ConquistaTemporada,
  ConquistaTipo,
} from "@/features/league/data/getConquistasDoCompetidor"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Ordem de exibição dos troféus dentro de uma temporada (mais nobre primeiro). */
const ORDEM_TIPO: Record<ConquistaTipo, number> = {
  campeao: 0,
  vice: 1,
  promovido: 2,
  artilheiro: 3,
  melhor_ataque: 4,
  melhor_defesa: 5,
  melhor_sequencia: 6,
  rebaixado: 7,
}

interface TenureVigenteRow {
  competitor_id: string
  season_id: string | null
  tournament_id: string
  division_season_id: string | null
  division: {
    id: string
    season_id: string
    tournament_id: string | null
    tournament_id_clausura: string | null
    final_tournament_id: string | null
  } | null
}

interface ConquistaRow {
  competitor_id: string
  ref_id: string
  ref_rotulo: string
  tipo: string
  nivel: number | null
  valor_texto: string | null
  valor_num: number | null
  jogador: string | null
  conquistado_em: string
  competitor: {
    rotulo: string | null
    team: { nome: string | null } | null
  } | null
}

const chavePar = (competitorId: string, seasonId: string) => `${competitorId}|${seasonId}`

/**
 * Troféus HERDADOS por um técnico: a estante de `conquistas` (escopo `temporada`)
 * dos pares `(competitor_id, season_id)` em que o técnico foi VIGENTE na rodada
 * FINAL da temporada (`encerrada_em IS NULL`). A herança é 100% leitura derivada —
 * o writer `registrar_conquistas_temporada` grava por competidor; aqui cruzamos
 * tenure-vigente × conquistas.
 *
 * A herança tem DOIS níveis por `(competitor_id, season_id)` — porque a grande
 * final só coroa CAMPEÃO/VICE, não os demais troféus:
 *   - GERAL (promovido/rebaixado/artilheiro/melhor_*, e também campeão/vice quando
 *     NÃO há grande final): vai ao técnico vigente no ÚLTIMO TURNO REGULAR
 *     (`tournament_id_clausura ?? tournament_id`), que TODO competidor joga —
 *     inclusive não-finalistas. (Se usássemos a grande final para tudo, o troféu de
 *     um rebaixado — sem tenure de final e com a Clausura filtrada — sumiria.)
 *   - TÍTULO (campeão/vice) com grande final: vai ao técnico vigente na GRANDE
 *     FINAL (só os finalistas a jogam; `season_id NULL`, mapeado por
 *     `final_tournament_id → season_id`), que pode diferir do da Clausura.
 * Em SPLIT há duas tenures regulares por par (Apertura + Clausura); só a Clausura
 * (último turno) conta para o GERAL, e DEDUPLICAMOS por `(competitor_id, season_id)`.
 * Em ciclo anual o par é único (dedup no-op). Vigência sempre `encerrada_em IS NULL`.
 *
 * Retorna `[]` se o técnico não herda nada ou em erro de IO (a estante é
 * secundária). Agrupado por `(competitor, temporada)`, com o clube no rótulo.
 */
export async function getConquistasDoTecnico(
  supabase: ServerClient,
  { userId }: { userId: string }
): Promise<ConquistaTemporada[]> {
  // (1) Tenures VIGENTES do técnico + a geometria da divisão (para achar o
  // torneio decisivo do split). A da grande final vem com `division` nulo
  // (division_season_id NULL) e `tournament_id` = final_tournament_id.
  const { data: tenuresData, error: tenuresError } = await supabase
    .from("coach_tenures")
    .select(
      `competitor_id, season_id, tournament_id, division_season_id,
       division:league_division_seasons!coach_tenures_division_season_id_fkey (
         id, season_id, tournament_id, tournament_id_clausura, final_tournament_id
       )`
    )
    .eq("user_id", userId)
    .is("encerrada_em", null)
  if (tenuresError || !tenuresData) return []

  const tenures = tenuresData as unknown as TenureVigenteRow[]

  // (2) Torneios das tenures de GRANDE FINAL (division nulo, season_id nulo):
  // mapear final_tournament_id → season_id via league_division_seasons.
  const finalTournamentIds = tenures
    .filter((t) => t.division == null && t.season_id == null)
    .map((t) => t.tournament_id)
  const finalSeasonPorTorneio = new Map<string, string>()
  if (finalTournamentIds.length > 0) {
    const { data: finalDivs } = await supabase
      .from("league_division_seasons")
      .select("season_id, final_tournament_id")
      .in("final_tournament_id", finalTournamentIds)
    for (const d of finalDivs ?? []) {
      if (d.final_tournament_id && d.season_id) {
        finalSeasonPorTorneio.set(d.final_tournament_id, d.season_id)
      }
    }
  }

  // (3) Dois níveis de herança por (competitor_id, season_id):
  //   - GERAL (promovido/rebaixado/artilheiro/melhores + campeão/vice quando não há
  //     grande final): vai ao técnico vigente no ÚLTIMO TURNO REGULAR
  //     (tournament_id_clausura ?? tournament_id), que TODO competidor joga —
  //     inclusive os não-finalistas. Sem isso, o troféu de um rebaixado (que não tem
  //     tenure de grande final e cuja Clausura seria filtrada) some do perfil.
  //   - TÍTULO (campeão/vice) quando HÁ grande final: vai ao técnico vigente na
  //     GRANDE FINAL (só os finalistas a jogam), que pode diferir do da Clausura.
  const paresGeral = new Set<string>()
  const paresTitulo = new Set<string>()
  for (const t of tenures) {
    if (t.division) {
      const ultimoRegular =
        t.division.tournament_id_clausura ?? t.division.tournament_id
      if (ultimoRegular && t.tournament_id === ultimoRegular) {
        const chave = chavePar(t.competitor_id, t.division.season_id)
        paresGeral.add(chave)
        // Sem grande final ⇒ o título também sai do último turno regular.
        if (t.division.final_tournament_id == null) paresTitulo.add(chave)
      }
      // Apertura (quando há Clausura) não decide nada por esta tenure.
    } else {
      // Tenure de GRANDE FINAL: concede APENAS o título (campeão/vice).
      const seasonId = finalSeasonPorTorneio.get(t.tournament_id)
      if (seasonId) paresTitulo.add(chavePar(t.competitor_id, seasonId))
    }
  }
  const todosPares = new Set([...paresGeral, ...paresTitulo])
  if (todosPares.size === 0) return []

  // (4) Conquistas dos pares. Sobre-busca por competidor × season e filtra pela
  // tupla exata + o nível de herança do TIPO (PostgREST não tem IN de tupla).
  const competitorIds = [...new Set([...todosPares].map((k) => k.split("|")[0]))]
  const seasonIds = [...new Set([...todosPares].map((k) => k.split("|")[1]))]
  const { data: conqData, error: conqError } = await supabase
    .from("conquistas")
    .select(
      `competitor_id, ref_id, ref_rotulo, tipo, nivel, valor_texto, valor_num, jogador, conquistado_em,
       competitor:league_competitors!conquistas_competitor_id_fkey (
         rotulo, team:teams ( nome )
       )`
    )
    .eq("escopo", "temporada")
    .in("competitor_id", competitorIds)
    .in("ref_id", seasonIds)
    .order("conquistado_em", { ascending: false })
  if (conqError || !conqData) return []

  const TIPO_TITULO = new Set(["campeao", "vice"])
  const conquistas = (conqData as unknown as ConquistaRow[]).filter((c) => {
    const chave = chavePar(c.competitor_id, c.ref_id)
    return TIPO_TITULO.has(c.tipo) ? paresTitulo.has(chave) : paresGeral.has(chave)
  })

  // (5) Agrupa por (competidor, temporada) — chave única mesmo se a mesma season
  // aparecesse para clubes distintos. Rótulo com o clube na frente.
  const porGrupo = new Map<string, ConquistaTemporada>()
  for (const row of conquistas) {
    const grupoKey = chavePar(row.competitor_id, row.ref_id)
    const clubeNome =
      row.competitor?.rotulo ?? row.competitor?.team?.nome ?? "Competidor"
    let grupo = porGrupo.get(grupoKey)
    if (!grupo) {
      grupo = {
        refId: grupoKey,
        rotulo: `${clubeNome} · ${row.ref_rotulo}`,
        conquistadoEm: row.conquistado_em,
        trofeus: [],
      }
      porGrupo.set(grupoKey, grupo)
    }
    grupo.trofeus.push({
      tipo: row.tipo as ConquistaTipo,
      nivel: row.nivel,
      valorTexto: row.valor_texto,
      valorNum: row.valor_num,
      jogador: row.jogador,
    })
  }

  const grupos = [...porGrupo.values()]
  for (const g of grupos) {
    g.trofeus.sort((a, b) => (ORDEM_TIPO[a.tipo] ?? 99) - (ORDEM_TIPO[b.tipo] ?? 99))
  }
  // Mais recente primeiro (a query já vem desc por conquistado_em).
  grupos.sort((a, b) => (a.conquistadoEm < b.conquistadoEm ? 1 : -1))
  return grupos
}
