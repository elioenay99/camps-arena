import "server-only"

import type { createClient } from "@/lib/supabase/server"
import {
  confrontoDireto,
  ordenarPorData,
  type ConfrontoDireto,
  type PartidaCronologica,
} from "@/features/standings/insights"
import { partidaNaJanela } from "@/features/standings/coachStats"

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

interface Janela {
  ini: number | null
  fim: number | null
}

/** slot_id → janelas de comando de um técnico. */
type JanelasPorSlot = Map<string, Janela[]>

async function janelasDoTecnico(
  supabase: ServerClient,
  userId: string
): Promise<JanelasPorSlot> {
  const { data, error } = await supabase
    .from("coach_tenures")
    .select("slot_id, rodada_inicio, rodada_fim")
    .eq("user_id", userId)
  const mapa: JanelasPorSlot = new Map()
  if (error || !data) return mapa
  for (const t of data) {
    const j: Janela = { ini: t.rodada_inicio, fim: t.rodada_fim }
    const arr = mapa.get(t.slot_id)
    if (arr) arr.push(j)
    else mapa.set(t.slot_id, [j])
  }
  return mapa
}

/** A vaga `slot` estava sob comando na `rodada` (alguma janela contém a rodada)? */
function comandavaNa(
  janelas: JanelasPorSlot,
  slot: string | null,
  rodada: number | null
): boolean {
  if (slot === null) return false
  const arr = janelas.get(slot)
  if (!arr) return false
  return arr.some((j) => partidaNaJanela(rodada, j.ini, j.fim))
}

/**
 * Confronto direto GLOBAL entre DOIS técnicos (`users.id`), distinto do confronto
 * entre competidores. Resolve as janelas de comando de A e de B → busca as partidas
 * das vagas de A → mantém só as em que o lado OPOSTO é vaga de B E a `rodada` cai
 * nas janelas de comando dos DOIS ao mesmo tempo → re-chaveia os lados como
 * `"A"`/`"B"` (respeitando o `wo_vencedor`) → `confrontoDireto` ordenado por DATA.
 * Auto-confronto (A==B) e erro de IO degradam para vazio.
 */
export async function getConfrontoTecnicos(
  supabase: ServerClient,
  { userAId, userBId }: { userAId: string; userBId: string }
): Promise<ConfrontoDireto> {
  if (userAId === userBId) return VAZIO

  const [janelasA, janelasB] = await Promise.all([
    janelasDoTecnico(supabase, userAId),
    janelasDoTecnico(supabase, userBId),
  ])
  if (janelasA.size === 0 || janelasB.size === 0) return VAZIO

  const slotsA = [...janelasA.keys()]

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      "id, vaga_1, vaga_2, placar_1, placar_2, status, rodada, created_at, wo, wo_vencedor, wo_duplo"
    )
    .or(`vaga_1.in.(${slotsA.join(",")}),vaga_2.in.(${slotsA.join(",")})`)
    .eq("status", "encerrada")
  if (error || !matches) return VAZIO

  const partidas: PartidaCronologica[] = []
  for (const m of matches) {
    // Lado de A: a vaga que A comandava na rodada da partida.
    let ladoA: 1 | 2 | null = null
    if (comandavaNa(janelasA, m.vaga_1, m.rodada)) ladoA = 1
    else if (comandavaNa(janelasA, m.vaga_2, m.rodada)) ladoA = 2
    if (ladoA === null) continue

    const slotA = ladoA === 1 ? m.vaga_1 : m.vaga_2
    const slotB = ladoA === 1 ? m.vaga_2 : m.vaga_1
    // O lado oposto tem de ser uma vaga que B comandava na MESMA rodada.
    if (!comandavaNa(janelasB, slotB, m.rodada)) continue

    const woVencedor =
      m.wo && m.wo_vencedor != null
        ? m.wo_vencedor === slotA
          ? "A"
          : m.wo_vencedor === slotB
            ? "B"
            : null
        : null

    partidas.push({
      participante_1: ladoA === 1 ? "A" : "B",
      participante_2: ladoA === 1 ? "B" : "A",
      placar_1: m.placar_1,
      placar_2: m.placar_2,
      status: m.status,
      woVencedor,
      woDuplo: m.wo === true && m.wo_duplo === true,
      rodada: m.rodada,
      criadaEm: m.created_at,
      id: m.id,
    })
  }

  return confrontoDireto("A", "B", partidas, ordenarPorData)
}
