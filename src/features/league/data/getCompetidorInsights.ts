import "server-only"

import type { createClient } from "@/lib/supabase/server"
import {
  calcularForma,
  calcularDestaquesCompetidor,
  ordenarPorData,
  type ItemForma,
  type DestaquesCompetidor,
  type PartidaCronologica,
} from "@/features/standings/insights"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export interface CompetidorInsights {
  /** Forma da carreira do competidor (cronológica por DATA; a UI pega os últimos 5). */
  forma: ItemForma[]
  destaques: DestaquesCompetidor
}

const VAZIO: CompetidorInsights = {
  forma: [],
  destaques: {
    jogos: 0,
    vitorias: 0,
    empates: 0,
    derrotas: 0,
    golsPro: 0,
    golsContra: 0,
    maiorGoleada: null,
    maiorInvencibilidade: 0,
    maiorSequenciaVitorias: 0,
    maiorSequenciaCleanSheets: 0,
    totalCleanSheets: 0,
    mediaGolsPorJogo: 0,
  },
}

/**
 * Insights de CARREIRA de um competidor persistente (forma + destaques), para a
 * página do competidor. Percurso (trilha de `getArtilheirosDoCompetidor`):
 * `tournament_slots` do competidor → `matches` de qualquer slot dele → re-chaveia
 * o LADO do competidor (e o `wo_vencedor`) para o `competitorId` canônico, unindo
 * todos os slots (um por temporada) numa identidade só (A2). Ordena por DATA
 * (`ordenarPorData`) — a carreira cruza competições, onde a rodada é por-competição
 * (A4). A RLS de `matches` filtra a visibilidade (rodada oculta não entra).
 *
 * Degrada para vazio em qualquer erro de IO (a seção é secundária).
 */
export async function getCompetidorInsights(
  supabase: ServerClient,
  { competitorId }: { competitorId: string }
): Promise<CompetidorInsights> {
  const { data: slots, error: slotsErr } = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("competitor_id", competitorId)
  if (slotsErr || !slots || slots.length === 0) return VAZIO

  const slotIds = slots.map((s) => s.id)
  const slotSet = new Set(slotIds)

  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select(
      "id, vaga_1, vaga_2, placar_1, placar_2, status, rodada, created_at, wo, wo_vencedor, wo_duplo"
    )
    .or(`vaga_1.in.(${slotIds.join(",")}),vaga_2.in.(${slotIds.join(",")})`)
  if (matchesErr || !matches || matches.length === 0) return VAZIO

  // Re-chaveia o lado do competidor para o id canônico; o adversário mantém o
  // slot (irrelevante — só lemos a entrada do competidor). Igual para o vencedor
  // do W.O.: se o slot vencedor é do competidor, vira o id canônico.
  const canon = (slot: string | null): string | null =>
    slot !== null && slotSet.has(slot) ? competitorId : slot

  const partidas: PartidaCronologica[] = matches.map((m) => ({
    participante_1: canon(m.vaga_1),
    participante_2: canon(m.vaga_2),
    placar_1: m.placar_1,
    placar_2: m.placar_2,
    status: m.status,
    woVencedor: m.wo ? canon(m.wo_vencedor) : null,
    woDuplo: m.wo === true && m.wo_duplo === true,
    rodada: m.rodada,
    criadaEm: m.created_at,
    id: m.id,
  }))

  const forma = calcularForma(partidas, ordenarPorData).get(competitorId) ?? []
  const destaques = calcularDestaquesCompetidor(competitorId, partidas)
  return { forma, destaques }
}
