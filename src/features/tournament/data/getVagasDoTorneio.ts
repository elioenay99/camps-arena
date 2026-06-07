import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Técnico ATUAL de uma vaga (anulável: clube órfão). */
export interface TecnicoDaVaga {
  id: string
  nome: string | null
}

/** Uma VAGA do torneio competitivo: o clube É a vaga; o técnico é metadado. */
export interface VagaDoTorneio {
  id: string
  clube: string
  escudoUrl: string | null
  /** Técnico atual; null = clube órfão ("vaga aberta"). */
  tecnico: TecnicoDaVaga | null
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
      `id,
       clube:teams!tournament_slots_team_id_fkey ( nome, escudo_url ),
       tecnico:users!tournament_slots_user_id_fkey ( id, nome )`
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
    clube: { nome: string | null; escudo_url: string | null } | null
    tecnico: { id: string; nome: string | null } | null
  }>

  return linhas.map((linha) => ({
    id: linha.id,
    clube: linha.clube?.nome?.trim() || "Clube",
    escudoUrl: linha.clube?.escudo_url ?? null,
    tecnico: linha.tecnico ? { id: linha.tecnico.id, nome: linha.tecnico.nome } : null,
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
