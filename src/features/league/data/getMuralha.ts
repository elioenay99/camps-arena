import "server-only"

import type { createClient } from "@/lib/supabase/server"
import { escudoEfetivo } from "@/lib/escudoEfetivo"
import {
  calcularMuralha,
  type CompetidorMuralha,
  type LinhaMuralha,
  type PartidaCronologica,
} from "@/features/standings/insights"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type { LinhaMuralha }

/**
 * Ranking de defesas ("Muralha") de uma COMPETIÇÃO — um torneio (`[id]`) ou o
 * conjunto de torneios de uma temporada/pirâmide (as divisões). Espelha o
 * PLUMBING de `getArtilharia` (slot → competidor + casamento lado→competidor em
 * memória), mas com QUERY PRÓPRIA de `matches`: a de `getArtilharia` só pega
 * `id, vaga_1, vaga_2` e deriva de `match_goals` — inútil aqui, já que a defesa
 * vem do PLACAR do adversário, não dos gols marcados. Seleciona os placares +
 * o estado de W.O. e filtra `status = encerrada` no banco. A regra de exclusão
 * de W.O. e a agregação vivem em `calcularMuralha` (pura, testada). A RLS de
 * `matches` filtra a visibilidade (partida de rodada oculta não entra).
 * Partidas AVULSAS (vaga sem `competitor_id`) são ignoradas, como na artilharia.
 *
 * Retorna `[]` sem torneios, sem partidas visíveis, ou em erro de IO.
 */
export async function getMuralha(
  supabase: ServerClient,
  { tournamentIds }: { tournamentIds: string[] }
): Promise<LinhaMuralha[]> {
  if (tournamentIds.length === 0) return []

  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select(
      "id, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor, wo_duplo"
    )
    .in("tournament_id", tournamentIds)
    .eq("status", "encerrada")
  if (matchesErr || !matches || matches.length === 0) return []

  const vagaIds = [
    ...new Set(
      matches
        .flatMap((m) => [m.vaga_1, m.vaga_2])
        .filter((v): v is string => v !== null)
    ),
  ]
  if (vagaIds.length === 0) return []

  // `competidor` traz o override LOCAL do escudo (escudo-personalizado-liga): a
  // vaga já aponta para o competidor da pirâmide, então é UM hop — sem query extra.
  const { data: slots, error: slotsErr } = await supabase
    .from("tournament_slots")
    .select(
      `id, competitor_id, rotulo,
       team:teams ( nome, escudo_url ),
       competidor:league_competitors!tournament_slots_competitor_id_fkey ( escudo_url )`
    )
    .in("id", vagaIds)
  if (slotsErr || !slots) return []

  // slot → competidor (id, nome, escudo). Vaga sem competitor_id (avulso/legado)
  // fica de fora — não entra no ranking, como na artilharia.
  const mapaLadoCompetidor = new Map<string, CompetidorMuralha>()
  for (const s of slots) {
    if (!s.competitor_id) continue
    const team = s.team as unknown as {
      nome: string | null
      escudo_url: string | null
    } | null
    const competidor = s.competidor as unknown as { escudo_url: string | null } | null
    const nome = s.rotulo?.trim() || team?.nome?.trim() || "Competidor"
    mapaLadoCompetidor.set(s.id, {
      competitorId: s.competitor_id,
      nome,
      escudoUrl: escudoEfetivo(competidor?.escudo_url, team?.escudo_url),
    })
  }

  // Shim para `PartidaCronoElegivel`. O W.O. é GATEADO em `m.wo` (espelha
  // getCompetidorInsights.ts): um `wo_vencedor` residual num match NÃO-W.O.
  // dispararia o ramo de W.O. em `resultadoDoLado` e mataria um clean sheet real
  // — nunca o `wo_vencedor` cru. `participante` = slot cru (aqui não há remap de
  // carreira); os campos cronológicos são irrelevantes (a Muralha não ordena por
  // tempo), preenchidos com sentinelas.
  const partidas: PartidaCronologica[] = matches.map((m) => ({
    participante_1: m.vaga_1,
    participante_2: m.vaga_2,
    placar_1: m.placar_1,
    placar_2: m.placar_2,
    status: m.status,
    woVencedor: m.wo ? m.wo_vencedor : null,
    woDuplo: m.wo === true && m.wo_duplo === true,
    rodada: null,
    criadaEm: "",
    id: m.id,
  }))

  return calcularMuralha(partidas, mapaLadoCompetidor)
}
