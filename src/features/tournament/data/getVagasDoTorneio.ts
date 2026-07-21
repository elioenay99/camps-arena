import "server-only"

import { createClient } from "@/lib/supabase/server"
import { escudoEfetivo } from "@/lib/escudoEfetivo"

/** Técnico ATUAL de uma vaga (anulável: clube órfão). */
export interface TecnicoDaVaga {
  id: string
  nome: string | null
  avatar: string | null
}

/** Uma VAGA do torneio competitivo: o clube É a vaga; o técnico é metadado. */
export interface VagaDoTorneio {
  id: string
  /** Nome exibido: clube (modo clube) ou o rótulo (modo por-nome). */
  clube: string
  escudoUrl: string | null
  /** Técnico atual; null = clube órfão ("vaga aberta"). */
  tecnico: TecnicoDaVaga | null
  /** Vaga por NOME (sem clube): sem técnico, sem convite. */
  porNome: boolean
}

/**
 * Vagas (clubes) de um torneio COMPETITIVO — alimenta a VagasSection da
 * página do torneio. Visibilidade pela RLS (`slots_select_visivel`: quem vê o
 * torneio vê as vagas). Embed aninhado com FK-hints explícitos (padrão do
 * repo): clube (sempre) e técnico (anulável). SEM `celular` — PII
 * desnecessária aqui (a convocação usa o técnico embutido nas partidas). Ordem
 * por entrada (created_at): estável, não reordena conforme o técnico troca.
 */
export async function getVagasDoTorneio(
  tournamentId: string
): Promise<VagaDoTorneio[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("tournament_slots")
    .select(
      `id, rotulo,
       clube:teams!tournament_slots_team_id_fkey ( nome, escudo_url ),
       competidor:league_competitors!tournament_slots_competitor_id_fkey ( escudo_url ),
       tecnico:users!tournament_slots_user_id_fkey ( id, nome, avatar )`
    )
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: true })

  if (error) {
    throw new Error(`Falha ao carregar as vagas: ${error.message}`)
  }

  // Embeds to-one chegam como objeto único; tipo explícito na fronteira de
  // confiança (mesma decisão de getTournamentClassificacao).
  const linhas = (data ?? []) as unknown as Array<{
    id: string
    rotulo: string | null
    clube: { nome: string | null; escudo_url: string | null } | null
    /** Override LOCAL do escudo por liga (escudo-personalizado-liga). */
    competidor: { escudo_url: string | null } | null
    tecnico: { id: string; nome: string | null; avatar: string | null } | null
  }>

  return linhas.map((linha) => ({
    id: linha.id,
    // Modo clube → nome do time; modo por-nome → rótulo. Fallback final defensivo.
    clube: linha.clube?.nome?.trim() || linha.rotulo?.trim() || "Vaga",
    escudoUrl: escudoEfetivo(linha.competidor?.escudo_url, linha.clube?.escudo_url),
    // Vaga por nome (sem clube): sem técnico, sem convite.
    tecnico: linha.clube
      ? linha.tecnico
        ? { id: linha.tecnico.id, nome: linha.tecnico.nome, avatar: linha.tecnico.avatar }
        : null
      : null,
    porNome: linha.clube == null,
  }))
}

/**
 * Códigos de convite das vagas (slot_id → code) — SEGREDO DO DONO. A RLS de
 * `slot_invites` (`slot_invites_select_owner`) só devolve linhas ao dono do
 * torneio; mesmo assim a página GATEIA esta chamada ao dono, e a UI só
 * renderiza o link para ele. Mapa por slot_id para casar com as vagas.
 */
export async function getCodigosDasVagas(
  tournamentId: string
): Promise<Map<string, string>> {
  const supabase = await createClient()

  // Filtra os invites pelas vagas DESTE torneio via embed inner: a RLS já
  // restringe ao dono; o inner garante que o filtro de torneio se aplique.
  const { data, error } = await supabase
    .from("slot_invites")
    .select(
      "slot_id, code, slot:tournament_slots!slot_invites_slot_id_fkey!inner ( tournament_id )"
    )
    .eq("slot.tournament_id", tournamentId)

  if (error) {
    throw new Error(`Falha ao carregar os convites das vagas: ${error.message}`)
  }

  const linhas = (data ?? []) as unknown as Array<{
    slot_id: string
    code: string
  }>

  return new Map(linhas.map((linha) => [linha.slot_id, linha.code]))
}
