import "server-only"

import { createClient } from "@/lib/supabase/server"
import { carregarCelulares } from "@/lib/contatos"
import { podeArbitrar } from "@/lib/autorizacao"
import type { MatchStatus, TournamentStatus } from "@/lib/supabase/database.types"

export interface ParticipanteResumo {
  /** Id do usuário — decide o LADO do atalho de convocação (quem chama quem). */
  id: string
  nome: string | null
  avatar: string | null
  /** PII: reinjetado pela RPC `celulares_de_contato` (gate de co-participação),
   * não pelo embed — a coluna perdeu o grant de SELECT. Alimenta o wa.me. */
  celular: string | null
}

export interface ClubeResumo {
  nome: string
  escudo_url: string | null
}

/**
 * Vaga de clube no torneio (formatos competitivos). O LADO é o CLUBE; o
 * técnico é metadado anulável (vaga órfã → `tecnico` null). Alimenta o card
 * competitivo (escudo + nome do clube) e o atalho de convocação (celular do
 * técnico da vaga adversária).
 */
export interface VagaResumo {
  id: string
  /** Clube da vaga; null no modo por-nome (o nome vem de `rotulo`). */
  clube: ClubeResumo | null
  /** Rótulo livre (modo por-nome); null no modo clube. */
  rotulo: string | null
  /** Técnico ATUAL da vaga (substituível); null em vaga sem técnico/por nome. */
  tecnico: ParticipanteResumo | null
}

export interface PartidaAtiva {
  id: string
  placar_1: number
  placar_2: number
  status: MatchStatus
  created_at: string
  // Nunca null: `tournament_id` é NOT NULL no schema e o embed usa `!inner`.
  tournament: { id: string; titulo: string; status: TournamentStatus }
  // Avulso: lados são PESSOAS (e clube cosmético por partida).
  participante_1: ParticipanteResumo | null
  participante_2: ParticipanteResumo | null
  time_1: ClubeResumo | null
  time_2: ClubeResumo | null
  // Competitivo: lados são VAGAS (clube + técnico). Mutuamente exclusivo com
  // os participantes (CHECK `matches_lado_vaga_ou_user`); o card decide qual
  // par renderizar pela presença da vaga.
  vaga_1: VagaResumo | null
  vaga_2: VagaResumo | null
  /** O usuário ARBITRA este torneio (dono/admin/árbitro)? Decide, no competitivo,
   * se ele lança o placar DIRETO (true) ou ENVIA PARA APROVAÇÃO com foto (false).
   * change add-proposta-resultado-foto. */
  podeArbitrar: boolean
}

// Colunas comuns das DUAS consultas (avulso e competitivo) — o shape final é
// idêntico; o que muda é o FILTRO de "partidas que me dizem respeito".
// `celular` NÃO entra mais no embed (a coluna perdeu o grant de SELECT): é
// reinjetado pela RPC gated `celulares_de_contato` após a query (ver fim da
// função). O embed traz só `id` para casar a reinjeção por id.
const COLUNAS = `id, placar_1, placar_2, status, created_at,
   tournament:tournaments!matches_tournament_id_fkey!inner ( id, titulo, status ),
   participante_1:users!matches_participante_1_fkey ( id, nome, avatar ),
   participante_2:users!matches_participante_2_fkey ( id, nome, avatar ),
   time_1:teams!matches_time_1_fkey ( nome, escudo_url ),
   time_2:teams!matches_time_2_fkey ( nome, escudo_url ),
   vaga_1:tournament_slots!matches_vaga_1_fkey ( id, rotulo, clube:teams ( nome, escudo_url ), tecnico:users ( id, nome, avatar ) ),
   vaga_2:tournament_slots!matches_vaga_2_fkey ( id, rotulo, clube:teams ( nome, escudo_url ), tecnico:users ( id, nome, avatar ) )`

/**
 * Lista as partidas ativas (não encerradas) que dizem respeito ao usuário, em
 * DUAS consultas mescladas por `created_at` (D7):
 *
 *  (a) AVULSAS — torneios pessoa-cêntricos: a query devolve toda partida não
 *      encerrada (visível por RLS) onde o usuário é `participante_1/2`; aqui o
 *      filtro de propriedade é a própria RLS de visibilidade (comportamento
 *      preservado do modelo anterior — "partidas que me dizem respeito").
 *  (b) COMPETITIVAS — torneios de clube: partidas cujas vagas (`vaga_1/vaga_2`)
 *      o usuário comanda como técnico. O subselect nos ids das MINHAS vagas
 *      isola "partidas do meu clube" sem depender de `.or()` sobre embed (D7:
 *      frágil no PostgREST; duas viagens explícitas são mais simples e
 *      indexáveis).
 *
 * Decisões herdadas (valem para ambas):
 * - FK-hint explícito desambigua os relacionamentos matches→users/teams/slots.
 * - `celular` (PII) é reinjetado pela RPC `celulares_de_contato` (gate de
 *   co-participação), não pelo embed — a coluna perdeu o grant de SELECT.
 * - `.neq('encerrada')` (não whitelist): falha-segura a novos status do enum.
 * - Torneio `encerrado` tira a partida do dashboard via `!inner` + `.neq` no
 *   ALIAS `tournament` (exigência do PostgREST para embeds aliased).
 * - Ordem por `created_at` ascendente: estável a cada atualização de placar.
 */
export async function getActiveMatches(): Promise<PartidaAtiva[]> {
  const supabase = await createClient()

  // Identidade: o ramo competitivo precisa do conjunto das MINHAS vagas. Sem
  // sessão, retorna vazio (a página já redireciona; defesa em profundidade).
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // (a) Avulsas — preserva a semântica anterior (RLS de visibilidade decide).
  const avulsasPromise = supabase
    .from("matches")
    .select(COLUNAS)
    .is("vaga_1", null)
    .or(`participante_1.eq.${user.id},participante_2.eq.${user.id}`)
    .neq("status", "encerrada")
    .neq("tournament.status", "encerrado")
    .order("created_at", { ascending: true })

  // (b) Competitivas — partidas das MINHAS vagas. Subselect dos ids das vagas
  // que comando; sem nenhuma, pulamos a viagem (lista vazia).
  const minhasVagas = await supabase
    .from("tournament_slots")
    .select("id")
    .eq("user_id", user.id)

  if (minhasVagas.error) {
    throw new Error(
      `Falha ao carregar partidas ativas: ${minhasVagas.error.message}`
    )
  }

  const idsVagas = (minhasVagas.data ?? []).map((v) => v.id)

  const competitivasPromise =
    idsVagas.length > 0
      ? supabase
          .from("matches")
          .select(COLUNAS)
          .or(
            `vaga_1.in.(${idsVagas.join(",")}),vaga_2.in.(${idsVagas.join(",")})`
          )
          .neq("status", "encerrada")
          .neq("tournament.status", "encerrado")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as unknown[], error: null })

  const [avulsas, competitivas] = await Promise.all([
    avulsasPromise,
    competitivasPromise,
  ])

  if (avulsas.error) {
    // Borbulha para o error.tsx; em produção o Next mascara a mensagem do
    // servidor (só o digest chega ao cliente) — sem vazamento de detalhes.
    throw new Error(`Falha ao carregar partidas ativas: ${avulsas.error.message}`)
  }
  if (competitivas.error) {
    throw new Error(
      `Falha ao carregar partidas ativas: ${competitivas.error.message}`
    )
  }

  // Mescla por created_at ascendente (ordem estável já vem de cada query; o
  // merge final reordena o conjunto unido). Embeds to-one chegam como objeto
  // único (ou null para FK anulável); o tipo explícito é a fonte de verdade.
  const todas = [
    ...((avulsas.data ?? []) as unknown as PartidaAtiva[]),
    ...((competitivas.data ?? []) as unknown as PartidaAtiva[]),
  ]

  // Reinjeta o `celular` dos lados via RPC gated (co-participação). Sempre
  // `?? null` para nunca deixar a chave `undefined` (o downstream lê null).
  const celulares = await carregarCelulares(
    supabase,
    todas.flatMap((p) => [
      p.participante_1?.id,
      p.participante_2?.id,
      p.vaga_1?.tecnico?.id,
      p.vaga_2?.tecnico?.id,
    ])
  )
  for (const p of todas) {
    if (p.participante_1)
      p.participante_1.celular = celulares.get(p.participante_1.id) ?? null
    if (p.participante_2)
      p.participante_2.celular = celulares.get(p.participante_2.id) ?? null
    if (p.vaga_1?.tecnico)
      p.vaga_1.tecnico.celular = celulares.get(p.vaga_1.tecnico.id) ?? null
    if (p.vaga_2?.tecnico)
      p.vaga_2.tecnico.celular = celulares.get(p.vaga_2.tecnico.id) ?? null
  }

  // Capacidade de ARBITRAR por torneio (1 chamada por torneio distinto): decide
  // o modo do menu de placar no card competitivo (direto vs proposta com foto).
  // Só torneios com partida COMPETITIVA (vaga) precisam: o avulso grava direto e
  // nunca lê podeArbitrar — evita 1 RPC por torneio avulso.
  const tids = [
    ...new Set(
      todas
        .filter((p) => p.vaga_1 !== null || p.vaga_2 !== null)
        .map((p) => p.tournament.id)
    ),
  ]
  const arbitraPorTorneio = new Map<string, boolean>()
  await Promise.all(
    tids.map(async (tid) =>
      arbitraPorTorneio.set(tid, await podeArbitrar(supabase, { tournamentId: tid }))
    )
  )
  for (const p of todas) {
    p.podeArbitrar = arbitraPorTorneio.get(p.tournament.id) ?? false
  }

  todas.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return todas
}
