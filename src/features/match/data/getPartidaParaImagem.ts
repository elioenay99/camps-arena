import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type { PartidaEncerrada } from "@/features/standings/data/getTournamentClassificacao"

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * `PartidaEncerrada` (registro fiel do confronto) estendida para o card OG de
 * resultado (change add-frente-compartilhavel): + `tournament_id` (a rota EXIGE
 * `=== id` da URL, senão 404 sem oráculo) e + `avatarUrl_1/2` (foto do
 * participante no AVULSO, quando há). O escudo (competitivo) já vem em
 * `escudo_1/2`.
 */
export interface PartidaParaImagem extends PartidaEncerrada {
  tournament_id: string
  /** Foto do participante (avulso) do lado 1; null no competitivo ou sem foto. */
  avatarUrl_1: string | null
  avatarUrl_2: string | null
}

interface UserEmbed {
  nome: string | null
  avatar: string | null
}

interface SlotEmbed {
  rotulo: string | null
  team: { nome: string | null; escudo_url: string | null } | null
}

interface MatchRow {
  id: string
  tournament_id: string | null
  vaga_1: string | null
  vaga_2: string | null
  participante_1: string | null
  participante_2: string | null
  placar_1: number
  placar_2: number
  rodada: number | null
  perna: number | null
  grupo: number | null
  wo: boolean
  wo_vencedor: string | null
  wo_duplo: boolean
  updated_at: string
  p1: UserEmbed | null
  p2: UserEmbed | null
  v1: SlotEmbed | null
  v2: SlotEmbed | null
}

/** Mesmo fallback do motor/histórico para lado sem nome. */
function nomeOuFallback(nome: string | null | undefined): string {
  return nome?.trim() || "Sem nome"
}

/**
 * Lê UMA `matches` ENCERRADA por id SOB A RLS DO USUÁRIO (o cliente é o do
 * usuário, anon+cookies — nunca service-role: a defesa é a RLS, decisão 2 do
 * design). Projeta `tournament_id` (cross-check da rota) e AMBOS os embeds:
 * competitivo (`v1/v2` → clube + escudo) e AVULSO (`p1/p2` → nome + `avatarUrl`,
 * sem escudo). Sem esse ramo avulso o card renderizaria "A definir x A definir".
 * Partida ausente/oculta pela RLS ⇒ `null` (a rota vira 404 sem oráculo).
 */
export async function getPartidaParaImagem(
  supabase: ServerClient,
  matchId: string
): Promise<PartidaParaImagem | null> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, tournament_id, vaga_1, vaga_2, participante_1, participante_2, placar_1, placar_2, rodada, perna, grupo, wo, wo_vencedor, wo_duplo, updated_at,
       p1:users!matches_participante_1_fkey ( nome, avatar ),
       p2:users!matches_participante_2_fkey ( nome, avatar ),
       v1:tournament_slots!matches_vaga_1_fkey ( rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ) ),
       v2:tournament_slots!matches_vaga_2_fkey ( rotulo, team:teams!tournament_slots_team_id_fkey ( nome, escudo_url ) )`
    )
    .eq("id", matchId)
    .eq("status", "encerrada")
    .maybeSingle()

  if (error || !data) return null
  const m = data as unknown as MatchRow
  if (!m.tournament_id) return null

  // Competitivo ⇔ há vaga em algum lado — a CHECK `matches_lado_vaga_ou_user`
  // garante que a partida é OU por-vaga (competitivo) OU por-participante (avulso).
  const competitivo = m.vaga_1 !== null || m.vaga_2 !== null

  const nome1 = competitivo
    ? m.v1
      ? nomeOuFallback(m.v1.team?.nome ?? m.v1.rotulo)
      : "A definir"
    : m.p1
      ? nomeOuFallback(m.p1.nome)
      : "A definir"
  const nome2 = competitivo
    ? m.v2
      ? nomeOuFallback(m.v2.team?.nome ?? m.v2.rotulo)
      : "A definir"
    : m.p2
      ? nomeOuFallback(m.p2.nome)
      : "A definir"

  // Lado vencedor do W.O. (1|2): compara o vencedor com o id CRU do lado (vaga
  // no competitivo, participante no avulso). null fora de W.O. ou em W.O. duplo.
  const ladoCru1 = competitivo ? m.vaga_1 : m.participante_1
  const ladoCru2 = competitivo ? m.vaga_2 : m.participante_2
  const woVencedorLado: 1 | 2 | null =
    m.wo && !m.wo_duplo
      ? m.wo_vencedor === ladoCru1
        ? 1
        : m.wo_vencedor === ladoCru2
          ? 2
          : null
      : null

  return {
    id: m.id,
    nome_1: nome1,
    nome_2: nome2,
    placar_1: m.placar_1,
    placar_2: m.placar_2,
    encerradaEm: m.updated_at,
    rodada: m.rodada,
    perna: m.perna,
    grupo: m.grupo,
    escudo_1: competitivo ? (m.v1?.team?.escudo_url ?? null) : null,
    escudo_2: competitivo ? (m.v2?.team?.escudo_url ?? null) : null,
    wo: m.wo,
    woVencedorLado,
    woDuplo: m.wo === true && m.wo_duplo === true,
    tournament_id: m.tournament_id,
    avatarUrl_1: competitivo ? null : (m.p1?.avatar ?? null),
    avatarUrl_2: competitivo ? null : (m.p2?.avatar ?? null),
  }
}
