import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import {
  carregarPosicoesDeCorte,
  type LinhaReal,
} from "@/features/league/promedios"
import { carregarLinhasBaseDivisao } from "@/features/league/data/carregarLinhasBaseDivisao"
import {
  rechavearInsights,
  type InsightsClassificacao,
} from "@/features/standings/insights"
import { getSeasonBoundaries } from "@/features/league/data/getSeasonBoundaries"
import type {
  LeagueBoundaryMode,
  TournamentStatus,
} from "@/lib/supabase/database.types"

/** Posições (1-based) que sobem / caem numa divisão. */
export interface Zonas {
  /** Posições que SOBEM DIRETO (sem chave). */
  acesso: number[]
  /** Posições que CAEM DIRETO (sem chave). */
  rebaixamento: number[]
  /** Posições que vão à CHAVE de acesso (decidem o acesso jogando). */
  playoffAcesso: number[]
  /** Posições que vão à CHAVE de playout (decidem a permanência jogando). */
  playoffRebaixamento: number[]
}

/**
 * Forma da fronteira que `derivarZonas` precisa: o sobe/cai DIRETO e a config de
 * playoff (modo/estilo/vagas). A página passa só o subconjunto mínimo; os campos
 * de playoff são opcionais (ausentes ⇒ tratada como 'direto', retrocompatível).
 */
export interface FronteiraZona {
  nivelSuperior: number
  vagasAcesso: number
  vagasRebaixamento: number
  modo?: LeagueBoundaryMode
  playoffEstilo?: string | null
  playoffVagas?: number | null
}

/** Classificação de UMA divisão da pirâmide, com as zonas de sobe/cai. */
export interface DivisaoStandings {
  /** Linhas já com nome resolvido (rótulo = identidade do competidor). */
  linhas: LinhaComNome[]
  /** Status do torneio da divisão = APERTURA (rascunho/ativo/encerrado). */
  status: TournamentStatus
  /**
   * Divisão pronta para o FLUXO (gate de nível de página). No split exige AS DUAS
   * meias encerradas; em `grupos_mata_mata` exige os grupos completos. A página usa
   * isto (não o `status`, que é só da Apertura) para liberar montar playoffs/fluxo.
   */
  encerradaParaFluxo: boolean
  /**
   * Posições de acesso/rebaixamento desta divisão (vazias se sem fronteira). Em
   * divisões `promedios` (Fase 4), são as POSIÇÕES REAIS dos competidores no
   * corte por promedio (lista não-contígua) — a faixa cai na linha certa.
   */
  zonas: Zonas
  /**
   * Promedio por `competitor_id` (= `participanteId` da linha). Presente só em
   * divisões `promedios` — alimenta a coluna "Pro" da StandingsTable. Ausente nas
   * divisões `posicao` (comportamento legado).
   */
  promedios?: Map<string, number>
  /**
   * Insights (change add-insights-classificacao) já re-chaveados slot→competidor.
   * `null` no ciclo SPLIT (fora do MVP) — a página só renderiza o bloco quando
   * presente.
   */
  insights: InsightsClassificacao | null
}

/** Empurra `[de, ate]` (1-based, clampado a [1, total]) em `destino`. */
function intervalo(destino: number[], de: number, ate: number, total: number) {
  for (let p = Math.max(1, de); p <= Math.min(total, ate); p++) destino.push(p)
}

/**
 * Deriva as zonas (posições 1-based) de uma divisão a partir das fronteiras.
 * Particiona cada lado em DIRETO (sobe/cai sem jogar) vs PLAYOFF (vai à chave):
 *
 *  - fronteira ACIMA (nivelSuperior = nivel - 1) ⇒ esta divisão é a INFERIOR/fonte
 *    do acesso. As posições do TOPO formam a zona de acesso:
 *      • 'direto' / 'playout' (a chave do playout decide a queda da superior, não
 *        o acesso daqui) ⇒ os `vagasAcesso` primeiros sobem DIRETO;
 *      • 'playoff_acesso' 'vagas' ⇒ os `playoffVagas` primeiros vão à CHAVE (sem
 *        acesso direto — a chave decide tudo);
 *      • 'playoff_acesso' 'extra' ⇒ os `vagasAcesso` primeiros sobem DIRETO e os
 *        `playoffVagas` logo abaixo vão à CHAVE (disputam a vaga extra).
 *
 *  - fronteira ABAIXO (nivelSuperior = nivel) ⇒ esta divisão é a SUPERIOR/fonte do
 *    rebaixamento. As posições do FUNDO formam a zona de queda:
 *      • 'direto' / 'playoff_acesso' (a chave do acesso vem da inferior) ⇒ os
 *        `vagasRebaixamento` últimos caem DIRETO;
 *      • 'playout' 'vagas' ⇒ os `playoffVagas` últimos vão à CHAVE;
 *      • 'playout' 'extra' ⇒ os `vagasRebaixamento` últimos caem DIRETO e os
 *        `playoffVagas` logo acima vão à CHAVE (disputam a permanência).
 *
 * Uma posição é OU direta OU de playoff, nunca as duas (partição). Função PURA —
 * o destino real (com empate/sorteio/resultado da chave) vive na action; aqui é
 * só o destaque visual, posicional.
 */
export function derivarZonas(
  nivel: number,
  total: number,
  fronteiras: readonly FronteiraZona[]
): Zonas {
  const acima = fronteiras.find((f) => f.nivelSuperior === nivel - 1)
  const abaixo = fronteiras.find((f) => f.nivelSuperior === nivel)

  const acesso: number[] = []
  const rebaixamento: number[] = []
  const playoffAcesso: number[] = []
  const playoffRebaixamento: number[] = []

  // --- Lado do ACESSO (topo da tabela), fronteira ACIMA, esta divisão é a fonte.
  if (acima) {
    const ehPlayoffAcesso = acima.modo === "playoff_acesso"
    if (acima.modo === "barragem_cruzada" && acima.playoffVagas) {
      // Barragem: A diretos no topo + a ZONA DE DISPUTA logo abaixo vai à chave
      // cruzada (B = pv/2 nos `pares`; k = pv-1 na `chave`).
      const nBarr =
        acima.playoffEstilo === "pares"
          ? acima.playoffVagas / 2
          : acima.playoffVagas - 1
      intervalo(acesso, 1, acima.vagasAcesso, total)
      intervalo(playoffAcesso, acima.vagasAcesso + 1, acima.vagasAcesso + nBarr, total)
    } else if (ehPlayoffAcesso && acima.playoffVagas) {
      if (acima.playoffEstilo === "extra") {
        // diretos no topo, depois a chave logo abaixo.
        intervalo(acesso, 1, acima.vagasAcesso, total)
        intervalo(
          playoffAcesso,
          acima.vagasAcesso + 1,
          acima.vagasAcesso + acima.playoffVagas,
          total
        )
      } else {
        // 'vagas': a chave inteira decide (nenhum acesso direto).
        intervalo(playoffAcesso, 1, acima.playoffVagas, total)
      }
    } else {
      // 'direto' (ou 'playout' acima — a chave dele decide a queda da superior).
      intervalo(acesso, 1, acima.vagasAcesso, total)
    }
  }

  // --- Lado da QUEDA (fundo da tabela), fronteira ABAIXO, esta divisão é a fonte.
  if (abaixo) {
    const ehPlayout = abaixo.modo === "playout"
    if (abaixo.modo === "barragem_cruzada" && abaixo.playoffVagas) {
      // Barragem: R diretos no fundo + a ZONA DE RISCO logo acima vai à chave
      // cruzada (B = pv/2 nos `pares`; 1 defensor na `chave`).
      const nBarr = abaixo.playoffEstilo === "pares" ? abaixo.playoffVagas / 2 : 1
      intervalo(rebaixamento, total - abaixo.vagasRebaixamento + 1, total, total)
      intervalo(
        playoffRebaixamento,
        total - abaixo.vagasRebaixamento - nBarr + 1,
        total - abaixo.vagasRebaixamento,
        total
      )
    } else if (ehPlayout && abaixo.playoffVagas) {
      if (abaixo.playoffEstilo === "extra") {
        // diretos no fundo, depois a chave logo acima.
        intervalo(rebaixamento, total - abaixo.vagasRebaixamento + 1, total, total)
        intervalo(
          playoffRebaixamento,
          total - abaixo.vagasRebaixamento - abaixo.playoffVagas + 1,
          total - abaixo.vagasRebaixamento,
          total
        )
      } else {
        // 'vagas': a chave inteira decide (nenhuma queda direta).
        intervalo(playoffRebaixamento, total - abaixo.playoffVagas + 1, total, total)
      }
    } else {
      // 'direto' (ou 'playoff_acesso' abaixo — a chave dele vem da inferior).
      intervalo(rebaixamento, total - abaixo.vagasRebaixamento + 1, total, total)
    }
  }

  return { acesso, rebaixamento, playoffAcesso, playoffRebaixamento }
}

/**
 * Classificação de uma divisão (reúso TOTAL do motor de liga). Carrega o
 * `tournament_id` da divisão (filtrando por posse transitiva) e delega a
 * `getTournamentClassificacao`, depois TROCA a identidade de cada linha: o motor
 * chaveia por `slot_id` e nomeia pelo clube/rótulo do slot — aqui reescrevemos o
 * `participanteId` para o `competitor_id` (estável entre temporadas), mantendo o
 * nome/escudo já resolvido. As zonas (acesso/rebaixamento) saem das fronteiras.
 *
 * Retorna `null` se a divisão não existe, é invisível ao usuário (RLS) ou ainda
 * não foi montada (sem torneio) — a página decide o que mostrar.
 *
 * O parâmetro `_userId` é mantido por compatibilidade com os call-sites; a
 * autorização NÃO o usa mais — deriva a capacidade da `competition_id` da season.
 */
export async function getDivisionStandings(
  divisionSeasonId: string,
  _userId: string | undefined,
  fronteiras: readonly {
    nivelSuperior: number
    vagasAcesso: number
    vagasRebaixamento: number
  }[]
): Promise<DivisaoStandings | null> {
  void _userId
  const supabase = await createClient()

  // Divisão + competition_id (para a checagem de capacidade de leitura).
  // `season_id` alimenta o fetch de metadados de playoff das fronteiras (modo/
  // estilo/vagas) — a página passa só o sobe/cai DIRETO, então enriquecemos aqui.
  // Fase 5.1: + tournament_id_clausura/formato/desempate + ciclo da season (split).
  const { data: divisao, error: divError } = await supabase
    .from("league_division_seasons")
    .select(
      "id, nivel, season_id, tournament_id, tournament_id_clausura, ranking_base, formato, desempate, league_seasons!inner ( ciclo, league_competitions!inner ( id ) )"
    )
    .eq("id", divisionSeasonId)
    .maybeSingle()

  if (divError) {
    throw new Error(`Falha ao carregar a divisão: ${divError.message}`)
  }
  if (!divisao || !divisao.tournament_id) {
    return null
  }

  // Sem gate de capacidade no app-layer (add-liga-visao-leitura): a visão de
  // leitura serve qualquer logado e a VISIBILIDADE é da RLS — a query acima já
  // devolve `null` (divisão invisível) quando a liga não é visível ao usuário. A
  // classificação é computada sobre as partidas que a RLS de `matches` entrega
  // (só rodadas liberadas ao não-dono), idêntico à página de torneio da divisão.

  // Metadados de playoff das fronteiras desta temporada (modo/estilo/vagas). A
  // página só repassa o sobe/cai DIRETO; aqui fundimos com a config de playoff
  // para que `derivarZonas` particione zona direta vs zona de chave. Fronteiras
  // 'direto' não têm playoff_vagas — caem no ramo direto naturalmente.
  //
  // FONTE ÚNICA por request (`getSeasonBoundaries`, memoizada por `season_id`): no
  // render da página esta função roda UMA vez POR DIVISÃO e hoje re-buscava as
  // fronteiras da MESMA season a cada chamada. Com a memoização, as N viagens
  // (e a de `getPlayoffs`) colapsam numa só. Lê só o subconjunto que precisa.
  const boundariesRaw = await getSeasonBoundaries(divisao.season_id)
  const playoffPorNivel = new Map(
    boundariesRaw.map((b) => [b.nivel_superior, b])
  )
  // Funde o sobe/cai DIRETO (vindo da página) com os metadados de playoff.
  const fronteirasZona: FronteiraZona[] = fronteiras.map((f) => {
    const meta = playoffPorNivel.get(f.nivelSuperior)
    return {
      ...f,
      modo: meta?.modo,
      playoffEstilo: meta?.playoff_estilo,
      playoffVagas: meta?.playoff_vagas,
    }
  })

  // slot_id → competitor_id (via entries da divisão) para reescrever a identidade.
  const { data: entries, error: entriesError } = await supabase
    .from("league_division_entries")
    .select("competitor_id, slot_id")
    .eq("division_season_id", divisionSeasonId)

  if (entriesError) {
    throw new Error(`Falha ao carregar as vagas da divisão: ${entriesError.message}`)
  }
  const competitorPorSlot = new Map<string, string>()
  for (const e of entries ?? []) {
    if (e.slot_id) competitorPorSlot.set(e.slot_id, e.competitor_id)
  }

  // Fase 5.1: FONTE ÚNICA da linhasBase + do encerramento. No split é a tabela
  // ANUAL COMBINADA (chaveada pelo slot da Apertura — o remap abaixo segue); no
  // anual é `linhasFaseGrupos ?? linhas` (5.2), byte-idêntico. As tabelas POR GRUPO
  // não são repassadas aqui (follow-up de UI; o agregado/combinada já é a fonte).
  const base = await carregarLinhasBaseDivisao(
    supabase,
    {
      tournament_id: divisao.tournament_id,
      tournament_id_clausura: divisao.tournament_id_clausura,
      formato: divisao.formato,
      desempate: divisao.desempate,
      ciclo:
        (divisao.league_seasons as unknown as { ciclo: string } | null)?.ciclo ??
        "anual",
    },
    // DISPLAY: falha de IO no gate de grupos degrada `encerradaParaFluxo=false`
    // (não aborta a render). O legado não chamava esse gate — preserva a tabela.
    true
  )
  if (!base) {
    return null
  }

  // Reescreve a chave da linha para o competitor_id (estável); o nome/escudo do
  // motor já é o do clube/rótulo do slot — preservado.
  const linhas: LinhaComNome[] = base.linhasBase.map((linha) => ({
    ...linha,
    participanteId:
      competitorPorSlot.get(linha.participanteId) ?? linha.participanteId,
  }))

  // Insights (change add-insights-classificacao): re-chaveia slot→competidor com
  // o MESMO mapa das linhas. `null` no split (fora do MVP).
  const insights: InsightsClassificacao | null = base.insightsPorSlot
    ? rechavearInsights(
        base.insightsPorSlot,
        (slot) => competitorPorSlot.get(slot) ?? slot
      )
    : null

  // `derivarZonas` devolve as zonas em ORDINAIS (top-N/bottom-N). Em divisões
  // 'posicao' o ordinal É a posição real. Em 'promedios' (Fase 4) o ordinal é o
  // RANK de promedio — traduzimos cada rank de volta à POSIÇÃO REAL do competidor
  // que o ocupa (lista não-contígua), senão a faixa cairia na linha errada.
  const zonasRank = derivarZonas(divisao.nivel, linhas.length, fronteirasZona)

  if (divisao.ranking_base !== "promedios") {
    return { linhas, status: base.statusApertura,
    encerradaParaFluxo: base.encerradaParaFluxo, zonas: zonasRank, insights }
  }

  const linhasReais: LinhaReal[] = linhas.map((l) => ({
    competitorId: l.participanteId,
    posicaoReal: l.posicao,
    pontos: l.pontos,
    jogos: l.jogos,
  }))
  const corte = await carregarPosicoesDeCorte(
    supabase,
    [divisionSeasonId],
    "promedios",
    linhasReais
  )
  if (!corte) {
    // Falha ao computar o promedio: degrada para as zonas por posição (sem
    // coluna), preservando a renderização da tabela.
    return { linhas, status: base.statusApertura,
    encerradaParaFluxo: base.encerradaParaFluxo, zonas: zonasRank, insights }
  }

  // rank de promedio → posição real (para traduzir as zonas ordinais).
  const realPosPorRank = new Map<number, number>()
  for (const l of linhas) {
    const rank = corte.posicaoCorte.get(l.participanteId)
    if (rank !== undefined) realPosPorRank.set(rank, l.posicao)
  }
  const traduzir = (ranks: number[]): number[] =>
    ranks
      .map((r) => realPosPorRank.get(r))
      .filter((p): p is number => p !== undefined)
  const zonas: Zonas = {
    acesso: traduzir(zonasRank.acesso),
    rebaixamento: traduzir(zonasRank.rebaixamento),
    playoffAcesso: traduzir(zonasRank.playoffAcesso),
    playoffRebaixamento: traduzir(zonasRank.playoffRebaixamento),
  }

  return {
    linhas,
    status: base.statusApertura,
    encerradaParaFluxo: base.encerradaParaFluxo,
    zonas,
    promedios: corte.promedio,
    insights,
  }
}
