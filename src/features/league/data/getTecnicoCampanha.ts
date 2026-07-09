import "server-only"

import type { createClient } from "@/lib/supabase/server"
import {
  agregarCampanhaTecnico,
  partidaNaJanela,
  type Campanha,
  type PartidaCreditada,
} from "@/features/standings/coachStats"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/** Um técnico com conta que o dono do perfil já enfrentou (picker de confronto). */
export interface AdversarioTecnico {
  userId: string
  nome: string
  avatar: string | null
  jogos: number
}

export interface TecnicoCampanha {
  total: Campanha
  porClube: Map<string, Campanha>
  adversarios: AdversarioTecnico[]
}

const CAMPANHA_VAZIA: Campanha = {
  jogos: 0,
  vitorias: 0,
  empates: 0,
  derrotas: 0,
  golsPro: 0,
  golsContra: 0,
  saldo: 0,
  aproveitamento: 0,
}

const VAZIO: TecnicoCampanha = {
  total: CAMPANHA_VAZIA,
  porClube: new Map(),
  adversarios: [],
}

/** Janela de uma tenure (numa vaga). */
interface Janela {
  competitorId: string
  ini: number | null
  fim: number | null
}

/** Tenure de uma vaga OPOSTA (para resolver o técnico adversário por janela). */
interface JanelaAdversario {
  userId: string | null
  ini: number | null
  fim: number | null
}

/**
 * Campanha de carreira de um TÉCNICO (`users.id`): números de sempre + fatia por
 * clube + adversários enfrentados. Atribuição PESSOAL por JANELA DE COMANDO
 * (`coach_tenures`, predicado meio-aberto de `partidaNaJanela`), distinta da
 * herança de troféus. Escopo é AUTOMÁTICO: as tenures só existem para vagas com
 * `competitor_id` — temporada de divisão, mata-mata derivado de liga E copa cuja
 * vaga por-clube herdou o competidor da divisão de origem (add-copa-tecnico-
 * heranca): esses jogos de copa ENTRAM na campanha, sob o mesmo clube de liga. A
 * tenure de copa é totalmente aberta (rodada nula, sem troca) → `partidaNaJanela`
 * credita a partida mesmo com `rodada` nula. Avulso, standalone e vaga de copa
 * por-nome/origem-copa/manual não geram tenure, logo ficam de fora sem filtro extra.
 *
 * Duas queries de leitura (tenures do técnico + `matches` das vagas dele) e mais
 * duas para os adversários (tenures das vagas opostas + `users_public`). Passa
 * pelos DOIS portões de RLS (`matches` por torneio/liberação e `coach_tenures` por
 * visibilidade da competição): partida cuja tenure não é legível é DESCARTADA.
 * Degrada para vazio em erro de IO (a seção é secundária; não quebra a página).
 */
export async function getTecnicoCampanha(
  supabase: ServerClient,
  { userId }: { userId: string }
): Promise<TecnicoCampanha> {
  // 1. Tenures do técnico (só com conta — a query filtra por user_id).
  const { data: tenures, error: tenuresErr } = await supabase
    .from("coach_tenures")
    .select("slot_id, competitor_id, rodada_inicio, rodada_fim")
    .eq("user_id", userId)
  if (tenuresErr || !tenures || tenures.length === 0) return VAZIO

  // slot_id → janelas do técnico (pode ter mais de uma: saiu e voltou / split).
  const janelasPorSlot = new Map<string, Janela[]>()
  for (const t of tenures) {
    const arr = janelasPorSlot.get(t.slot_id)
    const j: Janela = {
      competitorId: t.competitor_id,
      ini: t.rodada_inicio,
      fim: t.rodada_fim,
    }
    if (arr) arr.push(j)
    else janelasPorSlot.set(t.slot_id, [j])
  }
  const slotIds = [...janelasPorSlot.keys()]

  // 2. Partidas encerradas de qualquer vaga dele.
  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select(
      "id, vaga_1, vaga_2, placar_1, placar_2, rodada, wo, wo_vencedor, wo_duplo"
    )
    .or(`vaga_1.in.(${slotIds.join(",")}),vaga_2.in.(${slotIds.join(",")})`)
    .eq("status", "encerrada")
  if (matchesErr || !matches) return VAZIO

  // 3. Resolve lado + janela por partida. Descarta partida sem tenure-vaga cuja
  //    janela contenha a rodada (jogada por OUTRO técnico daquela vaga).
  const creditadas: PartidaCreditada[] = []
  // Por partida creditada guardamos a vaga OPOSTA + rodada, para os adversários.
  const opostos: { slot: string; rodada: number | null }[] = []

  for (const m of matches) {
    const lados: (1 | 2)[] = [1, 2]
    for (const lado of lados) {
      const slot = lado === 1 ? m.vaga_1 : m.vaga_2
      if (slot === null) continue
      const janelas = janelasPorSlot.get(slot)
      if (!janelas) continue
      const janela = janelas.find((j) => partidaNaJanela(m.rodada, j.ini, j.fim))
      if (!janela) continue

      const woVencedorLado: 1 | 2 | null =
        m.wo && m.wo_vencedor != null
          ? m.wo_vencedor === m.vaga_1
            ? 1
            : m.wo_vencedor === m.vaga_2
              ? 2
              : null
          : null

      creditadas.push({
        competitorId: janela.competitorId,
        lado,
        placar_1: m.placar_1,
        placar_2: m.placar_2,
        woVencedorLado,
        woDuplo: m.wo === true && m.wo_duplo === true,
      })
      const slotOposto = lado === 1 ? m.vaga_2 : m.vaga_1
      if (slotOposto !== null) opostos.push({ slot: slotOposto, rodada: m.rodada })
      break // um técnico comanda no máximo uma vaga por torneio → um lado só
    }
  }

  const { total, porClube } = agregarCampanhaTecnico(creditadas)

  // 4. Adversários enfrentados (só técnicos com conta, ≠ o próprio).
  const adversarios = await resolverAdversarios(supabase, opostos, userId)

  return { total, porClube, adversarios }
}

async function resolverAdversarios(
  supabase: ServerClient,
  opostos: { slot: string; rodada: number | null }[],
  userId: string
): Promise<AdversarioTecnico[]> {
  const slotsOpostos = [...new Set(opostos.map((o) => o.slot))]
  if (slotsOpostos.length === 0) return []

  const { data: tenures, error } = await supabase
    .from("coach_tenures")
    .select("slot_id, user_id, rodada_inicio, rodada_fim")
    .in("slot_id", slotsOpostos)
  if (error || !tenures) return []

  const janelasPorSlot = new Map<string, JanelaAdversario[]>()
  for (const t of tenures) {
    const arr = janelasPorSlot.get(t.slot_id)
    const j: JanelaAdversario = {
      userId: t.user_id,
      ini: t.rodada_inicio,
      fim: t.rodada_fim,
    }
    if (arr) arr.push(j)
    else janelasPorSlot.set(t.slot_id, [j])
  }

  // Conta jogos por adversário (o técnico da vaga oposta na janela da partida).
  const jogosPorUser = new Map<string, number>()
  for (const o of opostos) {
    const janelas = janelasPorSlot.get(o.slot)
    if (!janelas) continue
    const janela = janelas.find((j) => partidaNaJanela(o.rodada, j.ini, j.fim))
    if (!janela || janela.userId == null || janela.userId === userId) continue
    jogosPorUser.set(janela.userId, (jogosPorUser.get(janela.userId) ?? 0) + 1)
  }

  const userIds = [...jogosPorUser.keys()]
  if (userIds.length === 0) return []

  const { data: perfis, error: perfisErr } = await supabase
    .from("users_public")
    .select("id, nome, avatar")
    .in("id", userIds)
  if (perfisErr || !perfis) return []

  const porId = new Map(perfis.map((p) => [p.id, p]))
  return userIds
    .map((id) => {
      const p = porId.get(id)
      return {
        userId: id,
        nome: p?.nome?.trim() || "Técnico",
        avatar: p?.avatar ?? null,
        jogos: jogosPorUser.get(id) ?? 0,
      }
    })
    .sort((a, b) => b.jogos - a.jogos || a.nome.localeCompare(b.nome, "pt-BR"))
}
