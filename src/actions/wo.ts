"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { varrerOrfaosDaRodada } from "@/features/match/closeRound"
import { enviarNotificacoes } from "@/features/notifications/enviar"
import { podeArbitrar } from "@/lib/autorizacao"
import { removerEvidencia, subirEvidencia } from "@/lib/evidence"
import { createClient } from "@/lib/supabase/server"
import type { WoRequestStatus } from "@/lib/supabase/database.types"

export type WoResult = { ok: true } | { ok: false; error: string }
export type FecharRodadaResult =
  | { ok: true; marcadas: number }
  | { ok: false; error: string }

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const ERRO_PROPRIEDADE =
  "Partida não encontrada, torneio não está ativo ou você não é o dono dele."
const ERRO_GENERICO_WO =
  "Não foi possível marcar o W.O. agora. Tente novamente."

/**
 * Guards de W.O. numa partida de CHAVE (`posicao != null`):
 *  - **fase congelada**: a fase seguinte já foi gerada — espelha o gate de
 *    `reabrirPartida` (match.ts) e o trigger; não se mexe em fase anterior
 *    (risco 7 do design);
 *  - **confronto já decidido por W.O. na OUTRA perna** (ida-e-volta): W.O.
 *    decide o confronto inteiro, então um 2º W.O. na perna restante seria
 *    redundante/contraditório (resultado da chave deixaria de ser determinado
 *    pela 1ª perna). Um resultado NORMAL na outra perna não barra (W.O. de
 *    não-comparecimento na volta é legítimo).
 * Grupos/liga (`posicao == null`) não têm fase congelada nem pernas.
 */
async function validarWoChave(
  supabase: SupabaseServer,
  match: {
    tournament_id: string
    rodada: number | null
    posicao: number | null
    perna: number | null
  }
): Promise<string | null> {
  const { data: posteriores, error: errPost } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", match.tournament_id)
    .not("posicao", "is", null)
    .gt("rodada", match.rodada as number)
    .limit(1)
  if (errPost) {
    return ERRO_GENERICO_WO
  }
  if (posteriores && posteriores.length > 0) {
    return "A fase seguinte já foi gerada — esta fase está congelada."
  }

  if (match.perna !== null) {
    const { data: irma, error: errIrma } = await supabase
      .from("matches")
      .select("id")
      .eq("tournament_id", match.tournament_id)
      .eq("rodada", match.rodada as number)
      .eq("posicao", match.posicao as number)
      .neq("perna", match.perna)
      .eq("wo", true)
      .limit(1)
    if (errIrma) {
      return ERRO_GENERICO_WO
    }
    if (irma && irma.length > 0) {
      return "A outra perna deste confronto já foi decidida por W.O."
    }
  }
  return null
}

/**
 * Marca W.O. numa partida ABERTA, apontando o slot vencedor (um dos lados).
 * UPDATE único (wo + vencedor + placar 0x0 + encerrada) — não bate no lock de
 * imutabilidade (a partida sai de aberta). Compartilhado por marcarWO (adm
 * direto) e responderWO (aceite da solicitação). A autorização é por CAPACIDADE
 * ARBITRAR (dono, admin ou árbitro), transitiva pelo torneio da partida, com o
 * estado ATIVO por FILTRO; o trigger valida_resultado_mata_mata faz early-return
 * em `wo` (W.O. é decisão explícita, não valida placar).
 */
async function marcarWoInterno(
  supabase: SupabaseServer,
  matchId: string,
  vencedorSlotId: string
): Promise<WoResult> {
  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, status, tournament_id, posicao, rodada, perna, vaga_1, vaga_2")
    .eq("id", matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!match) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Capacidade ARBITRAR (dono, admin ou árbitro) por PRÉ-CHECK, TRANSITIVA pelo
  // torneio da partida; a RLS é o backstop.
  if (!(await podeArbitrar(supabase, { tournamentId: match.tournament_id }))) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Estado por FILTRO (a autorização já passou pelo pré-check): só torneio ATIVO
  // aceita W.O.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", match.tournament_id)
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!torneio) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  if (match.status === "encerrada") {
    return {
      ok: false,
      error: "Esta partida já está encerrada. Reabra antes de marcar W.O.",
    }
  }
  // O vencedor tem de ser um dos CLUBES (vagas) da partida — W.O. é só dos
  // formatos competitivos (lados por vaga).
  if (vencedorSlotId !== match.vaga_1 && vencedorSlotId !== match.vaga_2) {
    return { ok: false, error: "O vencedor precisa ser um dos clubes da partida." }
  }
  // Em CHAVE: respeita o congelamento de fase e não remarca um confronto que a
  // outra perna já decidiu por W.O. (decide o confronto inteiro).
  if (match.posicao != null) {
    const erroChave = await validarWoChave(supabase, match)
    if (erroChave) {
      return { ok: false, error: erroChave }
    }
  }

  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({
      wo: true,
      wo_vencedor: vencedorSlotId,
      placar_1: 0,
      placar_2: 0,
      status: "encerrada",
    })
    .eq("id", matchId)
    .neq("status", "encerrada")
    .select("id")
  if (updateError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!atualizada || atualizada.length === 0) {
    return {
      ok: false,
      error: "A partida pode ter sido alterada. Recarregue e tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

/** Adm marca W.O. direto numa partida aberta, escolhendo o clube vencedor. */
export async function marcarWO(
  matchId: unknown,
  vencedorSlotId: unknown
): Promise<WoResult> {
  const m = z.uuid().safeParse(matchId)
  const v = z.uuid().safeParse(vencedorSlotId)
  if (!m.success || !v.success) {
    return { ok: false, error: "Dados inválidos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  return marcarWoInterno(supabase, m.data, v.data)
}

/**
 * Declara DUPLO W.O. (ambos ausentes) numa partida ABERTA e JOGÁVEL de torneio
 * ATIVO, FORA de chave. Espelho simétrico do W.O. simples, mas SEM vencedor:
 * UPDATE `{wo:true, wo_duplo:true, wo_vencedor:null, 0x0, encerrada}`. Recusado
 * em CHAVE (`posicao != null`) — a chave sempre exige um vencedor (backstop na
 * CHECK do banco). Só capacidade ARBITRAR; não há "solicitar duplo" por técnico.
 */
export async function marcarWoDuplo(matchId: unknown): Promise<WoResult> {
  const m = z.uuid().safeParse(matchId)
  if (!m.success) {
    return { ok: false, error: "Dados inválidos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select("id, status, tournament_id, posicao, vaga_1, vaga_2")
    .eq("id", m.data)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!match) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Capacidade ARBITRAR (dono, admin ou árbitro) por PRÉ-CHECK; a RLS é o backstop.
  if (!(await podeArbitrar(supabase, { tournamentId: match.tournament_id }))) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Estado por FILTRO: só torneio ATIVO aceita W.O.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", match.tournament_id)
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!torneio) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  if (match.status === "encerrada") {
    return {
      ok: false,
      error: "Esta partida já está encerrada. Reabra antes de marcar W.O.",
    }
  }
  // Duplo é PROIBIDO em chave (mata-mata): a chave sempre exige um vencedor.
  if (match.posicao != null) {
    return {
      ok: false,
      error: "A chave exige um vencedor; use W.O. a favor de um dos lados.",
    }
  }
  // Partida JOGÁVEL: os dois lados presentes (não há duplo em bye/vaga vazia).
  if (match.vaga_1 == null || match.vaga_2 == null) {
    return {
      ok: false,
      error: "O duplo W.O. exige os dois clubes definidos na partida.",
    }
  }

  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({
      wo: true,
      wo_duplo: true,
      wo_vencedor: null,
      placar_1: 0,
      placar_2: 0,
      status: "encerrada",
    })
    .eq("id", m.data)
    .neq("status", "encerrada")
    .select("id")
  if (updateError) {
    return { ok: false, error: ERRO_GENERICO_WO }
  }
  if (!atualizada || atualizada.length === 0) {
    return {
      ok: false,
      error: "A partida pode ter sido alterada. Recarregue e tente novamente.",
    }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  return { ok: true }
}

/**
 * Fecha uma rodada (botão do dono): resolve por W.O. as partidas ainda abertas
 * contra clube órfão. Varre incondicionalmente (o dono decidiu fechar);
 * partidas jogáveis abertas NÃO são tocadas. Propriedade por filtro
 * (dono + torneio ativo).
 */
export async function fecharRodada(
  tournamentId: unknown,
  rodada: unknown
): Promise<FecharRodadaResult> {
  const t = z.uuid().safeParse(tournamentId)
  const r = z.number().int().min(1).safeParse(rodada)
  if (!t.success || !r.success) {
    return { ok: false, error: "Dados inválidos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // Capacidade ARBITRAR (dono, admin ou árbitro) por PRÉ-CHECK; a RLS (e a do
  // helper de varredura) é o backstop.
  if (!(await podeArbitrar(supabase, { tournamentId: t.data }))) {
    return {
      ok: false,
      error: "Torneio não encontrado, não está ativo ou você não é o dono dele.",
    }
  }

  // Estado por FILTRO (a autorização já passou pelo pré-check): só torneio ATIVO
  // fecha rodada.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", t.data)
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: "Não foi possível fechar a rodada agora. Tente novamente." }
  }
  if (!torneio) {
    return {
      ok: false,
      error: "Torneio não encontrado, não está ativo ou você não é o dono dele.",
    }
  }

  const { marcadas } = await varrerOrfaosDaRodada(supabase, t.data, r.data)

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${t.data}`)
  return { ok: true, marcadas }
}

/**
 * O TÉCNICO de um lado de uma partida aberta SOLICITA W.O. (o vencedor
 * pretendido é o PRÓPRIO clube). A RLS de INSERT é a barreira real; aqui
 * descobrimos o slot do solicitante e damos mensagens precisas. Uma pendente
 * por partida (índice único parcial → 23505).
 */
export async function solicitarWO(matchId: unknown, foto?: File | null): Promise<WoResult> {
  const m = z.uuid().safeParse(matchId)
  if (!m.success) {
    return { ok: false, error: "Partida inválida." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: match, error: fetchError } = await supabase
    .from("matches")
    .select(
      `id, status, tournament_id, vaga_1, vaga_2,
       v1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       v2:tournament_slots!matches_vaga_2_fkey ( user_id )`
    )
    .eq("id", m.data)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: "Não foi possível solicitar o W.O. agora. Tente novamente." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }
  if (match.status === "encerrada") {
    return { ok: false, error: "Esta partida já está encerrada." }
  }

  const v1 = match.v1 as unknown as { user_id: string | null } | null
  const v2 = match.v2 as unknown as { user_id: string | null } | null
  const meuSlot =
    v1?.user_id === user.id
      ? match.vaga_1
      : v2?.user_id === user.id
        ? match.vaga_2
        : null
  if (!meuSlot) {
    return { ok: false, error: "Você não joga esta partida." }
  }

  // Foto OPCIONAL de evidência (validada e subida na action; rollback no fail).
  let fotoPath: string | null = null
  if (foto instanceof File && foto.size > 0) {
    const up = await subirEvidencia(supabase, user.id, m.data, foto)
    if (!up.ok) return { ok: false, error: up.error }
    fotoPath = up.path
  }

  const { error: insertError } = await supabase
    .from("match_wo_requests")
    .insert({ match_id: m.data, solicitante_slot: meuSlot, foto_path: fotoPath })
  if (insertError) {
    if (fotoPath) await removerEvidencia(supabase, fotoPath) // rollback da foto órfã
    if (insertError.code === "23505") {
      return { ok: false, error: "Já existe uma solicitação de W.O. pendente para esta partida." }
    }
    console.error("solicitarWO falhou", insertError.code ?? insertError.message)
    return { ok: false, error: "Não foi possível solicitar o W.O. agora. Tente novamente." }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)

  // Notifica o DONO do torneio que há um pedido de W.O. (best-effort, nunca
  // lança). Re-query do torneio só para dono + título.
  const { data: torneio } = await supabase
    .from("tournaments")
    .select("created_by, titulo")
    .eq("id", match.tournament_id)
    .maybeSingle()
  await enviarNotificacoes(
    supabase,
    [torneio?.created_by],
    {
      title: "Solicitação de W.O.",
      body: `Há um pedido de W.O. em ${torneio?.titulo ?? "um torneio"}.`,
      url: `/dashboard/torneios/${match.tournament_id}`,
      tag: `torneio-${match.tournament_id}-wo`,
    },
    user.id
  )

  return { ok: true }
}

/**
 * O DONO responde a uma solicitação de W.O. pendente: aceitar marca a partida
 * como W.O. a favor do solicitante (reusa marcarWoInterno) e resolve a
 * solicitação; recusar só a resolve. Ordem falha-segura no aceite: marca a
 * partida (efeito real) ANTES de resolver a solicitação — se a marcação falha,
 * a solicitação fica pendente para nova tentativa. A RLS de UPDATE de
 * match_wo_requests garante que só o dono resolve.
 */
export async function responderWO(
  requestId: unknown,
  aceito: unknown
): Promise<WoResult> {
  const r = z.uuid().safeParse(requestId)
  const a = z.boolean().safeParse(aceito)
  if (!r.success || !a.success) {
    return { ok: false, error: "Dados inválidos." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // A RLS de SELECT devolve a solicitação ao dono (e ao solicitante); o gate de
  // resolução é a RLS de UPDATE (só dono) + o filtro de status pendente.
  const { data: req, error: reqError } = await supabase
    .from("match_wo_requests")
    .select("id, match_id, solicitante_slot, status")
    .eq("id", r.data)
    .maybeSingle()
  if (reqError) {
    return { ok: false, error: "Não foi possível responder agora. Tente novamente." }
  }
  if (!req || req.status !== "pendente") {
    return { ok: false, error: "Solicitação não encontrada ou já resolvida." }
  }

  if (a.data) {
    // Aceite: marca a partida W.O. a favor do solicitante PRIMEIRO (efeito
    // real). Falhou (partida já encerrada/corrida) → não resolve a solicitação.
    const marcou = await marcarWoInterno(
      supabase,
      req.match_id,
      req.solicitante_slot
    )
    if (!marcou.ok) {
      return marcou
    }
  }

  const novoStatus: WoRequestStatus = a.data ? "aceito" : "recusado"
  const { data: resolvida, error: updateError } = await supabase
    .from("match_wo_requests")
    .update({
      status: novoStatus,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", r.data)
    .eq("status", "pendente")
    .select("id, match_id")
  if (updateError) {
    return { ok: false, error: "Não foi possível responder agora. Tente novamente." }
  }
  if (!resolvida || resolvida.length === 0) {
    return { ok: false, error: "A solicitação pode ter sido resolvida. Recarregue." }
  }

  // marcarWoInterno já revalidou no aceite; no recuse, revalida aqui.
  if (!a.data) {
    const { data: match } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", req.match_id)
      .maybeSingle()
    revalidatePath("/dashboard")
    if (match) revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  }

  // Notifica os dois TÉCNICOS do confronto (solicitante + adversário) — o helper
  // remove o caller (o dono que respondeu). Leitura única das vagas + título do
  // torneio (a action não tinha o match-com-vagas carregado). Embed to-one das
  // vagas e de tournaments volta como objeto único — cast de fronteira (FK-hints
  // de vaga ainda fora dos Relationships de database.types). Best-effort.
  const { data: matchWo } = await supabase
    .from("matches")
    .select(
      `tournament_id,
       v1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       v2:tournament_slots!matches_vaga_2_fkey ( user_id ),
       tournaments ( titulo )`
    )
    .eq("id", req.match_id)
    .maybeSingle()
  if (matchWo) {
    const dados = matchWo as unknown as {
      tournament_id: string
      v1: { user_id: string | null } | null
      v2: { user_id: string | null } | null
      tournaments: { titulo: string } | null
    }
    await enviarNotificacoes(
      supabase,
      [dados.v1?.user_id, dados.v2?.user_id],
      {
        title: "W.O. respondido",
        body: `Uma decisão de W.O. saiu em ${dados.tournaments?.titulo ?? "um torneio"}.`,
        url: `/dashboard/torneios/${dados.tournament_id}`,
        tag: `torneio-${dados.tournament_id}-wo`,
      },
      user.id
    )
  }
  return { ok: true }
}
