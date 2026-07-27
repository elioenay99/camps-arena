"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { enviarNotificacoes } from "@/features/notifications/enviar"
import { podeArbitrar } from "@/lib/autorizacao"
import { createClient } from "@/lib/supabase/server"
import { adiarPartidaSchema } from "@/schema/matchSchema"

export type PostponementResult = { ok: true } | { ok: false; error: string }

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

const ERRO_PROPRIEDADE =
  "Partida não encontrada, torneio não está ativo ou você não é o dono dele."
const ERRO_GENERICO = "Não foi possível adiar a partida agora. Tente novamente."

/** Códigos `raise exception` da RPC `adiar_partida` → mensagem ao usuário. */
function mensagemErroRpc(message: string): string {
  const codigo =
    /(AUTH_REQUIRED|NAO_AUTORIZADO|PARTIDA_INVALIDA|CHAVE_NAO_ADIA|PARTIDA_INDISPONIVEL)/.exec(
      message
    )?.[1] ?? ""
  switch (codigo) {
    case "NAO_AUTORIZADO":
      return ERRO_PROPRIEDADE
    case "PARTIDA_INVALIDA":
      return "Partida não encontrada."
    case "CHAVE_NAO_ADIA":
      return "Partidas de chave não podem ser adiadas."
    case "PARTIDA_INDISPONIVEL":
      return "A partida foi alterada (já encerrada?). Recarregue e tente novamente."
    case "AUTH_REQUIRED":
      return "Você precisa estar autenticado."
    default:
      return ERRO_GENERICO
  }
}

/**
 * Notifica os dois TÉCNICOS do confronto que a partida foi adiada — mesmo
 * padrão de `responderWO` (`wo.ts`): embed das vagas + título do torneio,
 * best-effort (o helper absorve qualquer falha), excluindo o próprio caller.
 */
async function notificarAdiamento(
  supabase: SupabaseServer,
  matchId: string,
  motivo: string | undefined,
  callerId: string
): Promise<void> {
  const { data: matchAdiada } = await supabase
    .from("matches")
    .select(
      `tournament_id,
       v1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       v2:tournament_slots!matches_vaga_2_fkey ( user_id ),
       tournaments ( titulo )`
    )
    .eq("id", matchId)
    .maybeSingle()
  if (!matchAdiada) return

  const dados = matchAdiada as unknown as {
    tournament_id: string
    v1: { user_id: string | null } | null
    v2: { user_id: string | null } | null
    tournaments: { titulo: string } | null
  }
  await enviarNotificacoes(
    supabase,
    [dados.v1?.user_id, dados.v2?.user_id],
    {
      title: "Partida adiada",
      body: `Uma partida foi adiada em ${dados.tournaments?.titulo ?? "um torneio"}${
        motivo ? `: ${motivo}` : "."
      }`,
      url: `/dashboard/torneios/${dados.tournament_id}`,
      tag: `torneio-${dados.tournament_id}-adiamento`,
    },
    callerId
  )
}

/**
 * Adia uma partida ABERTA de liga/fase de grupos (`posicao is null`), com
 * motivo em texto livre OPCIONAL. A RPC `adiar_partida` muda o status para
 * `adiada` e cancela (rejeita/recusa) qualquer proposta de placar ou
 * solicitação de W.O. pendente da MESMA partida, numa única transação — evita
 * que uma pendência anterior ao adiamento seja aprovada depois com um
 * resultado desatualizado. As pré-checagens em TS dão mensagem melhor antes de
 * bater no banco; a RPC repete a autorização e os guards como backstop.
 */
export async function adiarPartida(
  matchId: unknown,
  motivo?: unknown
): Promise<PostponementResult> {
  const parsed = adiarPartidaSchema.safeParse({ matchId, motivo })
  if (!parsed.success) {
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
    .select("id, status, tournament_id, posicao")
    .eq("id", parsed.data.matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: ERRO_GENERICO }
  }
  if (!match) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Capacidade ARBITRAR (dono, admin ou árbitro) por PRÉ-CHECK, TRANSITIVA pelo
  // torneio da partida; a RPC repete como backstop.
  if (!(await podeArbitrar(supabase, { tournamentId: match.tournament_id }))) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  // Estado por FILTRO (a autorização já passou pelo pré-check): só torneio
  // ATIVO aceita adiamento — mesmo padrão do W.O. (wo.ts).
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", match.tournament_id)
    .eq("status", "ativo")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: ERRO_GENERICO }
  }
  if (!torneio) {
    return { ok: false, error: ERRO_PROPRIEDADE }
  }

  if (match.status === "encerrada") {
    return { ok: false, error: "Esta partida já está encerrada. Reabra antes de adiar." }
  }
  // Chave (mata-mata) nunca adia: o avanço de fase exige 'encerrada'.
  if (match.posicao != null) {
    return { ok: false, error: "Partidas de chave não podem ser adiadas." }
  }

  const { error: rpcError } = await supabase.rpc("adiar_partida", {
    p_match_id: parsed.data.matchId,
    p_motivo: parsed.data.motivo ?? null,
  })
  if (rpcError) {
    return { ok: false, error: mensagemErroRpc(rpcError.message) }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)

  // Best-effort de verdade: `enviarNotificacoes` já absorve suas próprias
  // falhas internamente (mesmo contrato de `responderWO`), mas o adiamento em
  // si (já confirmado acima) NUNCA pode ser derrubado por um problema na
  // notificação — o try/catch aqui é redundante por design, não confiança cega.
  try {
    await notificarAdiamento(supabase, parsed.data.matchId, parsed.data.motivo, user.id)
  } catch (e) {
    console.error("adiarPartida: notificação falhou", e)
  }

  return { ok: true }
}

/**
 * Reverte o adiamento de uma partida `adiada`, voltando-a ao estado aberto
 * normal (`em_andamento`, sem placar) — mesmo destino de `reabrirPartida`
 * (`match.ts`), inclusive o guard de torneio (`status <> 'encerrado'`, não
 * exige `'ativo'`: reabrir/desfazer em torneio `rascunho` é inofensivo, só
 * `encerrado` congela o lifecycle). UPDATE único, sem RPC: não há efeito
 * colateral em outra tabela para desfazer — uma proposta criada DEPOIS do
 * adiamento (enquanto a partida já estava aberta de novo) não é tocada, só o
 * PRÓPRIO adiamento é desfeito.
 */
export async function desfazerAdiamento(matchId: unknown): Promise<PostponementResult> {
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
    .select("id, status, tournament_id")
    .eq("id", m.data)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: ERRO_GENERICO }
  }
  const erroPropriedade =
    "Partida não encontrada, torneio encerrado ou você não é o dono dele."
  if (!match) {
    return { ok: false, error: erroPropriedade }
  }

  if (!(await podeArbitrar(supabase, { tournamentId: match.tournament_id }))) {
    return { ok: false, error: erroPropriedade }
  }

  // Lifecycle por FILTRO (a autorização já passou pelo pré-check): torneio
  // encerrado congela — reabrir/desfazer ali seria beco sem saída.
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", match.tournament_id)
    .neq("status", "encerrado")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: ERRO_GENERICO }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  if (match.status !== "adiada") {
    return { ok: false, error: "Esta partida não está adiada." }
  }

  const { data: atualizada, error: updateError } = await supabase
    .from("matches")
    .update({
      status: "em_andamento",
      adiada_em: null,
      adiada_por: null,
      adiamento_motivo: null,
    })
    .eq("id", m.data)
    .eq("status", "adiada")
    .select("id")
  if (updateError) {
    return { ok: false, error: "Não foi possível desfazer o adiamento agora. Tente novamente." }
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
