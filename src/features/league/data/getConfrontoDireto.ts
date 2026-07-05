import "server-only"

import type { createClient } from "@/lib/supabase/server"
import {
  confrontoDireto,
  ordenarPorData,
  type ConfrontoDireto,
  type PartidaCronologica,
} from "@/features/standings/insights"

type ServerClient = Awaited<ReturnType<typeof createClient>>

const VAZIO: ConfrontoDireto = {
  jogos: [],
  aVitorias: 0,
  empates: 0,
  bVitorias: 0,
  duploWo: 0,
  aDerrotas: 0,
  bDerrotas: 0,
  aGolsPro: 0,
  aGolsContra: 0,
}

async function slotsDoCompetidor(
  supabase: ServerClient,
  competitorId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("competitor_id", competitorId)
  if (error || !data) return []
  return data.map((s) => s.id)
}

/**
 * Histórico de confronto direto entre DOIS competidores persistentes (painel da
 * página do competidor). Resolve os slots de cada um → busca as partidas de A →
 * filtra as em que o OUTRO lado é um slot de B → re-chaveia lado∈slotsA → A,
 * lado∈slotsB → B (e o `wo_vencedor`), unificando slots de temporadas distintas
 * numa identidade só (A2) → `confrontoDireto` ordenado por DATA (A4). A RLS de
 * `matches` é a barreira. Degrada para confronto vazio em erro de IO.
 */
export async function getConfrontoDireto(
  supabase: ServerClient,
  {
    competitorAId,
    competitorBId,
  }: { competitorAId: string; competitorBId: string }
): Promise<ConfrontoDireto> {
  if (competitorAId === competitorBId) return VAZIO

  const [slotsA, slotsB] = await Promise.all([
    slotsDoCompetidor(supabase, competitorAId),
    slotsDoCompetidor(supabase, competitorBId),
  ])
  if (slotsA.length === 0 || slotsB.length === 0) return VAZIO

  const setA = new Set(slotsA)
  const setB = new Set(slotsB)

  // Partidas de A; filtramos em memória as em que o outro lado é de B.
  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      "id, vaga_1, vaga_2, placar_1, placar_2, status, rodada, created_at, wo, wo_vencedor, wo_duplo"
    )
    .or(`vaga_1.in.(${slotsA.join(",")}),vaga_2.in.(${slotsA.join(",")})`)
  if (error || !matches) return VAZIO

  const canon = (slot: string | null): string | null => {
    if (slot === null) return slot
    if (setA.has(slot)) return competitorAId
    if (setB.has(slot)) return competitorBId
    return slot
  }

  const partidas: PartidaCronologica[] = matches
    .filter((m) => {
      const aNoLado1 = m.vaga_1 !== null && setA.has(m.vaga_1)
      const outroLado = aNoLado1 ? m.vaga_2 : m.vaga_1
      return outroLado !== null && setB.has(outroLado)
    })
    .map((m) => ({
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

  return confrontoDireto(competitorAId, competitorBId, partidas, ordenarPorData)
}
