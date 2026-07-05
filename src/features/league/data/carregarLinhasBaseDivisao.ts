import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  getTournamentClassificacao,
  type LinhaComNome,
} from "@/features/standings/data/getTournamentClassificacao"
import { getDivisionClassificacaoCombinada } from "@/features/league/data/getDivisionClassificacaoCombinada"
import { faseDeGruposIncompleta } from "@/features/groups/montarFaseGruposPiramide"
import type { TiebreakerPreset } from "@/features/standings/computeStandings"
import type { InsightsClassificacao } from "@/features/standings/insights"
import type { TournamentStatus } from "@/lib/supabase/database.types"

/** Subconjunto da divisão que o helper precisa (cada caller injeta o `ciclo`). */
export interface DivisaoParaLinhasBase {
  tournament_id: string
  tournament_id_clausura: string | null
  formato: string
  desempate: string
  /** `ciclo` é coluna de `league_seasons` (per-season) — injetada pelo caller. */
  ciclo: string
}

export interface LinhasBaseDivisao {
  /**
   * Linhas-base chaveadas pelo SLOT (slot da APERTURA no split), no mesmo
   * contrato de `linhas`/`linhasFaseGrupos` — alimentam o remap slot→competidor
   * dos 4 consumidores SEM mudança.
   */
  linhasBase: LinhaComNome[]
  /**
   * Divisão pronta para o FLUXO: Apertura encerrada E (no split) Clausura
   * encerrada E (em `grupos_mata_mata`) fase de grupos completa.
   */
  encerradaParaFluxo: boolean
  /** Status do torneio da APERTURA (= `tournament_id`) — gate de render da página. */
  statusApertura: TournamentStatus
  /**
   * Insights (change add-insights-classificacao) chaveados pelo SLOT (o mesmo
   * lado canônico da `linhasBase`), para o remap slot→competidor do
   * `getDivisionStandings`. NÃO-SPLIT: os insights do torneio da divisão. SPLIT:
   * `null` — insights de liga no ciclo split ficam FORA do MVP (unir os dois
   * turnos exigiria estender o combinado a devolver as partidas; não se paga
   * aqui). Consumidores só renderizam o bloco quando não-null.
   */
  insightsPorSlot: InsightsClassificacao | null
}

/**
 * FONTE ÚNICA da `linhasBase` + do gate de encerramento de uma divisão (evita o
 * bug de "consumidor órfão": um sítio combinando os dois turnos, outro não). Os 4
 * consumidores (`calcularFluxoTemporada`, `montarPlayoffs`/`carregarDivisao`,
 * `getDivisionStandings`, e o caminho do promédio) chamam este helper.
 *
 * - SPLIT (`ciclo='apertura_clausura'` e `tournament_id_clausura` presente): a
 *   `linhasBase` é a TABELA ANUAL COMBINADA (`getDivisionClassificacaoCombinada`);
 *   `encerradaParaFluxo` = AMBAS as meias encerradas.
 * - NÃO-SPLIT (anual): `linhasFaseGrupos ?? linhas` (5.2/legado), byte-idêntico;
 *   `encerradaParaFluxo` = Apertura encerrada && (fase de grupos completa quando
 *   `grupos_mata_mata`).
 *
 * Recebe `supabase` por argumento (IO puro). Retorna `null` em erro de IO.
 *
 * `paraExibicao` (opt-in, só o caminho de DISPLAY usa): quando o gate de fase de
 * grupos (anual `grupos_mata_mata`) falha por IO, degrada `encerradaParaFluxo` para
 * `false` em vez de retornar `null` — preserva a renderização da `linhasBase` (como
 * no legado, que não chamava esse gate). `false` é conservador para AMBOS: no
 * display só afeta destaque de zona/CTA; no fluxo, `false` NÃO destrava. O FLUXO
 * mantém o default (`null` aborta) — na dúvida, não destrava.
 */
export async function carregarLinhasBaseDivisao(
  supabase: Awaited<ReturnType<typeof createClient>>,
  div: DivisaoParaLinhasBase,
  paraExibicao = false
): Promise<LinhasBaseDivisao | null> {
  const ehSplit =
    div.ciclo === "apertura_clausura" && div.tournament_id_clausura != null

  if (ehSplit) {
    const combinada = await getDivisionClassificacaoCombinada(supabase, {
      aperturaId: div.tournament_id,
      clausuraId: div.tournament_id_clausura as string,
      desempate: div.desempate as TiebreakerPreset,
    })
    if (!combinada) return null
    return {
      linhasBase: combinada.linhas,
      encerradaParaFluxo:
        combinada.aperturaEncerrado && combinada.clausuraEncerrado,
      statusApertura: combinada.aperturaStatus,
      // SPLIT: insights de liga fora do MVP (o combinado não devolve partidas).
      insightsPorSlot: null,
    }
  }

  // Não-split: caminho 5.2/legado, byte-idêntico.
  let classificacao
  try {
    classificacao = await getTournamentClassificacao(div.tournament_id)
  } catch (e) {
    console.error(
      "carregarLinhasBaseDivisao: classificação",
      e instanceof Error ? e.message : e
    )
    return null
  }
  if (!classificacao) return null

  const linhasBase = classificacao.linhasFaseGrupos ?? classificacao.linhas
  const statusApertura = classificacao.torneio.status
  const encerrado = statusApertura === "encerrado"

  let encerradaParaFluxo = encerrado
  if (encerrado && div.formato === "grupos_mata_mata") {
    const incompleta = await faseDeGruposIncompleta(supabase, div.tournament_id)
    // IO no gate de grupos: no DISPLAY, degrada para `false` (não destrava o fluxo
    // nem o destaque de zona) preservando a render da `linhasBase` como no legado;
    // no FLUXO, aborta com `null` (conservador — na dúvida, não montar playoffs).
    if (incompleta === null) {
      if (!paraExibicao) return null
      encerradaParaFluxo = false
    } else {
      encerradaParaFluxo = !incompleta
    }
  }

  // NÃO-SPLIT: os insights do torneio da divisão (chaveados por slot), da MESMA
  // query de `getTournamentClassificacao` — zero viagem nova. EXCEÇÃO
  // `grupos_mata_mata`: a tabela EXIBIDA é a da fase de grupos (`linhasFaseGrupos`),
  // mas os insights vêm da classificação GERAL + TODAS as partidas (inclui o
  // mata-mata) — forma/destaques ficariam inconsistentes com a tabela. Suprime
  // (null), como no split; as páginas já guardam com `standings.insights?`.
  const insightsPorSlot =
    div.formato === "grupos_mata_mata" ? null : classificacao.insights

  return { linhasBase, encerradaParaFluxo, statusApertura, insightsPorSlot }
}
