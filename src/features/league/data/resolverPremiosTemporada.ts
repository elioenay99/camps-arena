import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type { ItemPlanoFluxo } from "@/features/league/flowEngine"
import { getDivisionStandings } from "@/features/league/data/getDivisionStandings"
import { resolverCampeaoDivisaoSplit } from "@/features/league/data/getGrandeFinal"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * Um prêmio do PAYLOAD `p_premios` da RPC `registrar_conquistas_temporada`.
 * Chaveado por `competitor_id` (NUNCA por slot — a RPC valida pertencimento por
 * competitor). Só os tipos que a RPC deriva do payload: campeão/vice das divisões
 * coroadas por chave (liga-split + grupos_mata_mata) e os destaques estatísticos.
 * Campeão/vice de liga ANUAL, promovido/rebaixado e artilheiro são derivados em
 * SQL pela própria RPC — NÃO entram aqui.
 */
export interface PremioTemporada {
  competitor_id: string
  tipo: "campeao" | "vice" | "melhor_ataque" | "melhor_defesa" | "melhor_sequencia"
  nivel: number
  valor_texto: string | null
  valor_num: number | null
}

interface DivisaoRow {
  id: string
  nivel: number
  nome: string
  formato: string
  tournament_id: string | null
  tournament_id_clausura: string | null
  final_tournament_id: string | null
}

/** Sequência mínima para virar troféu "Melhor sequência" (1 vitória não é sequência). */
const SEQUENCIA_MINIMA = 2

/**
 * Monta o `p_premios` de uma temporada de liga em fechamento. Para cada divisão:
 *
 *  - **campeão/vice**: a RPC deriva em SQL SÓ em divisão liga de ciclo ANUAL. Aqui
 *    cobrimos os casos coroados por CHAVE, onde a `posicao_final` diverge do
 *    coroado:
 *      • liga SPLIT (apertura_clausura): campeão = VENCEDOR DA GRANDE FINAL, pela
 *        FONTE ÚNICA canônica `resolverCampeaoDivisaoSplit` (a mesma de
 *        getCompetitorProfile). Sem vice (a chave dá 1 vaga; runner-up fora do MVP).
 *      • grupos_mata_mata: mantém a semântica do app (getCompetitorProfile trata o
 *        não-split por `posicao_final`) — campeão = posição final 1, vice = 2, lidos
 *        do plano de fluxo (`itens`) já congelado.
 *  - **destaques** (melhor ataque/defesa/sequência): de `getDivisionStandings`, que
 *    JÁ re-chaveia os insights slot→competitor (`rechavearInsights`). É por isso que
 *    o payload sai com `competitor_id`, não slot id — usar a classificação por slot
 *    (getTournamentClassificacao) faria a RPC descartar os prêmios em silêncio.
 *    `null` no split (insights fora do MVP) → sem destaque.
 *
 * Best-effort por divisão: falha de IO numa divisão degrada (pula) sem derrubar o
 * encerramento inteiro — o caller trata o erro global.
 */
export async function resolverPremiosTemporada(
  supabase: ServerClient,
  seasonId: string,
  itens: readonly ItemPlanoFluxo[]
): Promise<PremioTemporada[]> {
  const { data: season } = await supabase
    .from("league_seasons")
    .select("ciclo")
    .eq("id", seasonId)
    .maybeSingle()
  const ehSeasonSplit = season?.ciclo === "apertura_clausura"

  const { data: divisoesRaw } = await supabase
    .from("league_division_seasons")
    .select(
      "id, nivel, nome, formato, tournament_id, tournament_id_clausura, final_tournament_id"
    )
    .eq("season_id", seasonId)
  const divisoes = (divisoesRaw ?? []) as DivisaoRow[]

  const premios: PremioTemporada[] = []

  for (const div of divisoes) {
    const ehSplit =
      ehSeasonSplit &&
      div.formato === "liga" &&
      div.tournament_id != null &&
      div.tournament_id_clausura != null

    // ── Campeão/vice das divisões coroadas por chave ──────────────────────────
    if (ehSplit && div.tournament_id && div.tournament_id_clausura) {
      const campeao = await resolverCampeaoDivisaoSplit(supabase, {
        divisionSeasonId: div.id,
        tournamentId: div.tournament_id,
        tournamentIdClausura: div.tournament_id_clausura,
        finalTournamentId: div.final_tournament_id,
      })
      if (campeao) {
        premios.push({
          competitor_id: campeao.competitorId,
          tipo: "campeao",
          nivel: div.nivel,
          valor_texto: div.nome,
          valor_num: null,
        })
      }
    } else if (div.formato === "grupos_mata_mata") {
      // Sem split: campeão/vice = posição final 1/2 (semântica de getCompetitorProfile
      // para o não-split). A RPC não os deriva (gate exclui grupos_mata_mata).
      const daDivisao = itens.filter((it) => it.nivelOrigem === div.nivel)
      const campeao = daDivisao.find((it) => it.posicaoFinal === 1)
      const vice = daDivisao.find((it) => it.posicaoFinal === 2)
      if (campeao) {
        premios.push({
          competitor_id: campeao.competitorId,
          tipo: "campeao",
          nivel: div.nivel,
          valor_texto: div.nome,
          valor_num: null,
        })
      }
      if (vice) {
        premios.push({
          competitor_id: vice.competitorId,
          tipo: "vice",
          nivel: div.nivel,
          valor_texto: div.nome,
          valor_num: null,
        })
      }
    }

    // ── Destaques estatísticos (já re-chaveados slot→competitor) ───────────────
    // Fronteiras irrelevantes para os insights (só alimentam zonas) → [].
    const standings = await getDivisionStandings(div.id, undefined, [])
    const destaques = standings?.insights?.destaques
    if (!destaques) continue

    if (destaques.melhorAtaque) {
      premios.push({
        competitor_id: destaques.melhorAtaque.participanteId,
        tipo: "melhor_ataque",
        nivel: div.nivel,
        valor_texto: `${destaques.melhorAtaque.valor} gols pró`,
        valor_num: destaques.melhorAtaque.valor,
      })
    }
    if (destaques.melhorDefesa) {
      premios.push({
        competitor_id: destaques.melhorDefesa.participanteId,
        tipo: "melhor_defesa",
        nivel: div.nivel,
        valor_texto: `${destaques.melhorDefesa.valor} gols sofridos`,
        valor_num: destaques.melhorDefesa.valor,
      })
    }
    const seq = destaques.maiorSequenciaVitorias
    if (seq && seq.extensao >= SEQUENCIA_MINIMA) {
      premios.push({
        competitor_id: seq.participanteId,
        tipo: "melhor_sequencia",
        nivel: div.nivel,
        valor_texto: `${seq.extensao} vitórias seguidas`,
        valor_num: seq.extensao,
      })
    }
  }

  return premios
}
