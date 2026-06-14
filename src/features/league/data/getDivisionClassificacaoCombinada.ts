import "server-only"

import { createClient } from "@/lib/supabase/server"
import {
  computeStandings,
  type TiebreakerPreset,
} from "@/features/standings/computeStandings"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import type { MatchStatus, TournamentStatus } from "@/lib/supabase/database.types"

/**
 * Tabela ANUAL COMBINADA de uma divisão de season split (Apertura + Clausura).
 * Contrato IDÊNTICO ao `linhas`/`linhasFaseGrupos` de `getTournamentClassificacao`
 * (LinhaComNome[]) — o motor de fluxo (`flowEngine.ts`) NUNCA muda; a combinada é
 * injetada como as `linhas` de `DivisaoFluxo`, igual ao agregado de grupos (Fase 5.2).
 */
export interface ClassificacaoCombinada {
  /** Linhas da combinada, chaveadas pelo SLOT da APERTURA (= `participanteId`). */
  linhas: LinhaComNome[]
  /** Status do torneio da Apertura (gate de render: rascunho/ativo/encerrado). */
  aperturaStatus: TournamentStatus
  clausuraStatus: TournamentStatus
  aperturaEncerrado: boolean
  clausuraEncerrado: boolean
}

interface SlotRow {
  id: string
  tournament_id: string
  competitor_id: string | null
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
}

interface PartidaRow {
  tournament_id: string
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  status: MatchStatus
  wo: boolean
  wo_vencedor: string | null
}

interface TorneioRow {
  id: string
  status: string
  pontos_vitoria: number
  pontos_empate: number
  pontos_derrota: number
}

/** Mesmo fallback do StandingsTable/getTournamentClassificacao. */
function nomeOuFallback(nome: string | null | undefined): string {
  return nome?.trim() || "Sem nome"
}

/**
 * Une as partidas dos DOIS turnos de uma divisão split numa única tabela e roda
 * `computeStandings` UMA vez. As partidas da Clausura são RE-CHAVEADAS pelo slot
 * da Apertura (slot Clausura → competidor → slot Apertura), de modo que os jogos
 * h2h do ANO INTEIRO (ambos os turnos) entrem na mesma união — só assim os presets
 * `espanhol`/`fifa` (mini-tabela) e o confronto direto do `cbf` operam sobre a
 * combinada (≠ somar dois agregados, que perderia o h2h). As linhas saem chaveadas
 * pelo slot da Apertura (= `entries.slot_id`), para que o remap slot→competidor dos
 * consumidores funcione SEM mudança no modelo de entries.
 *
 * Recebe `supabase` como argumento (IO puro reutilizável; NÃO é Server Action).
 * Split é SÓ liga (5.1b) ⇒ não há grupos a combinar. Retorna `null` em erro de IO.
 */
export async function getDivisionClassificacaoCombinada(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    aperturaId: string
    clausuraId: string
    /** Preset de desempate da divisão (ambas as meias nascem com o mesmo). */
    desempate: TiebreakerPreset
    /** Override do preset (testes). */
    tiebreakerOverride?: TiebreakerPreset
  }
): Promise<ClassificacaoCombinada | null> {
  const { aperturaId, clausuraId, desempate, tiebreakerOverride } = opts

  // (1) Torneios das duas meias: status (gate) + regras de pontuação (da Apertura;
  //     a RPC cria as duas com os mesmos defaults da tabela tournaments).
  const { data: torneios, error: torneiosErr } = await supabase
    .from("tournaments")
    .select("id, status, pontos_vitoria, pontos_empate, pontos_derrota")
    .in("id", [aperturaId, clausuraId])
  if (torneiosErr) {
    console.error("getDivisionClassificacaoCombinada: torneios", torneiosErr.code ?? torneiosErr.message)
    return null
  }
  const rows = (torneios ?? []) as unknown as TorneioRow[]
  const apertura = rows.find((t) => t.id === aperturaId)
  const clausura = rows.find((t) => t.id === clausuraId)
  if (!apertura || !clausura) return null

  // (2) Slots das duas meias. Mapas para o re-chaveamento + nomes/escudos (estes
  //     SÓ dos slots da Apertura — o lado canônico das linhas combinadas).
  const { data: slots, error: slotsErr } = await supabase
    .from("tournament_slots")
    .select(
      "id, tournament_id, competitor_id, rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url )"
    )
    .in("tournament_id", [aperturaId, clausuraId])
  if (slotsErr) {
    console.error("getDivisionClassificacaoCombinada: slots", slotsErr.code ?? slotsErr.message)
    return null
  }
  const slotRows = (slots ?? []) as unknown as SlotRow[]

  const aperturaSlotPorCompetitor = new Map<string, string>()
  const competitorPorClausuraSlot = new Map<string, string>()
  const nomes = new Map<string, string>()
  const escudos = new Map<string, string | null>()
  for (const s of slotRows) {
    if (s.tournament_id === aperturaId) {
      if (s.competitor_id) aperturaSlotPorCompetitor.set(s.competitor_id, s.id)
      nomes.set(s.id, nomeOuFallback(s.team?.nome ?? s.rotulo))
      escudos.set(s.id, s.team?.escudo_url ?? null)
    } else if (s.competitor_id) {
      competitorPorClausuraSlot.set(s.id, s.competitor_id)
    }
  }

  // Re-chaveia um lado da Clausura para o slot da Apertura do mesmo competidor.
  const reKeyClausura = (slotId: string | null): string | null => {
    if (!slotId) return null
    const competitor = competitorPorClausuraSlot.get(slotId)
    if (!competitor) return null
    return aperturaSlotPorCompetitor.get(competitor) ?? null
  }

  // (3) Partidas das duas meias. Apertura: lado cru = slot (já canônico).
  //     Clausura: re-chaveia AMBOS os lados E o `wo_vencedor` pelo slot Apertura.
  const { data: partidas, error: partidasErr } = await supabase
    .from("matches")
    .select("tournament_id, vaga_1, vaga_2, placar_1, placar_2, status, wo, wo_vencedor")
    .in("tournament_id", [aperturaId, clausuraId])
  if (partidasErr) {
    console.error("getDivisionClassificacaoCombinada: partidas", partidasErr.code ?? partidasErr.message)
    return null
  }
  const partRows = (partidas ?? []) as unknown as PartidaRow[]

  const linhasMotor = partRows.map((p) => {
    const ehClausura = p.tournament_id === clausuraId
    const l1 = ehClausura ? reKeyClausura(p.vaga_1) : p.vaga_1
    const l2 = ehClausura ? reKeyClausura(p.vaga_2) : p.vaga_2
    let woVenc = p.wo ? p.wo_vencedor : null
    if (ehClausura && woVenc) woVenc = reKeyClausura(woVenc)
    // Endurecimento (LOW do gate): omitir o re-key do wo_vencedor creditaria pontos
    // ao competidor errado em silêncio (computeStandings cai em lado2 sem erro). O
    // vencedor re-chaveado TEM de casar um dos dois lados re-chaveados.
    if (woVenc && woVenc !== l1 && woVenc !== l2) {
      throw new Error(
        "Inconsistência na combinada: vencedor de W.O. da Clausura não casa o confronto re-chaveado."
      )
    }
    return {
      participante_1: l1,
      participante_2: l2,
      placar_1: p.placar_1,
      placar_2: p.placar_2,
      status: p.status,
      woVencedor: woVenc,
    }
  })

  const regras = {
    vitoria: apertura.pontos_vitoria,
    empate: apertura.pontos_empate,
    derrota: apertura.pontos_derrota,
  }
  const tb: TiebreakerPreset = tiebreakerOverride ?? desempate

  const linhas: LinhaComNome[] = computeStandings(regras, linhasMotor, tb).map((linha) => ({
    ...linha,
    nome: nomes.get(linha.participanteId) ?? "Sem nome",
    escudoUrl: escudos.get(linha.participanteId) ?? null,
    avatarUrl: null,
  }))

  return {
    linhas,
    aperturaStatus: apertura.status as TournamentStatus,
    clausuraStatus: clausura.status as TournamentStatus,
    aperturaEncerrado: apertura.status === "encerrado",
    clausuraEncerrado: clausura.status === "encerrado",
  }
}
