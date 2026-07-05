"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { varrerOrfaosDaRodada } from "@/features/match/closeRound"
import { enviarNotificacoes } from "@/features/notifications/enviar"
import { removerEvidencia, subirEvidencia } from "@/lib/evidence"
import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import {
  proporPlacarSchema,
  rejeitarPropostaSchema,
  type RejeitarPropostaInput,
} from "@/schema/matchSchema"

export type ProporPlacarResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }
export type PropostaResult = { ok: true } | { ok: false; error: string }

const ERRO_GENERICO = "Não foi possível agora. Tente novamente."

/** Códigos `raise exception` dos RPCs → mensagem ao usuário. */
function mensagemErroRpc(message: string): string {
  const codigo =
    /(AUTH_REQUIRED|NAO_AUTORIZADO|PROPOSTA_INVALIDA|PARTIDA_INDISPONIVEL)/.exec(message)?.[1] ?? ""
  switch (codigo) {
    case "NAO_AUTORIZADO":
      return "Você não pode aprovar/rejeitar resultados neste campeonato."
    case "PROPOSTA_INVALIDA":
      return "Proposta não encontrada ou já resolvida."
    case "PARTIDA_INDISPONIVEL":
      return "A partida foi alterada. Recarregue e tente novamente."
    case "AUTH_REQUIRED":
      return "Você precisa estar autenticado."
    default:
      // Empate/decisão de mata-mata: ao aplicar o placar, o trigger
      // valida_resultado_mata_mata dá rollback com mensagem própria (pt-BR).
      // Repassa orientando a REJEITAR — senão o aprovador veria um erro genérico
      // de "tente de novo" para um placar que NUNCA poderá ser aprovado.
      if (/mata-mata|agregado|jogo de (ida|volta)/i.test(message)) {
        return `${message}. Rejeite a proposta e peça a correção do placar.`
      }
      return ERRO_GENERICO
  }
}

/**
 * O TÉCNICO de uma vaga propõe o placar (com foto obrigatória) numa partida
 * competitiva liberada e não encerrada. Não escreve o placar oficial — cria uma
 * proposta pendente que o aprovador (dono/admin/árbitro) aprova. O upload da
 * foto é feito aqui (a action constrói o path; sem forja); rollback se o INSERT
 * falhar. Reenvio substitui a própria proposta pendente (policy DELETE).
 */
export async function proporPlacar(formData: FormData): Promise<ProporPlacarResult> {
  // Autores dos gols (opcional): a UI serializa a lista como JSON num campo do
  // FormData. Parse defensivo — JSON malformado vira erro de validação (o Zod
  // recusa o array inválido), nunca uma exceção não tratada.
  let autoresRaw: unknown = undefined
  const autoresField = formData.get("autores")
  if (typeof autoresField === "string" && autoresField.trim() !== "") {
    try {
      autoresRaw = JSON.parse(autoresField)
    } catch {
      return { ok: false, error: "Autores dos gols inválidos." }
    }
  }

  const parsed = proporPlacarSchema.safeParse({
    matchId: formData.get("matchId"),
    placar_1: Number(formData.get("placar_1")),
    placar_2: Number(formData.get("placar_2")),
    autores: autoresRaw,
  })
  if (!parsed.success) {
    return {
      ok: false,
      error: "Placar inválido.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }
  const { matchId, placar_1, placar_2, autores } = parsed.data

  const foto = formData.get("foto")
  if (!(foto instanceof File) || foto.size === 0) {
    return { ok: false, error: "Anexe uma foto de evidência do placar." }
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
      `id, status, tournament_id, rodada, liberada_em, vaga_1, vaga_2,
       v1:tournament_slots!matches_vaga_1_fkey ( user_id ),
       v2:tournament_slots!matches_vaga_2_fkey ( user_id )`
    )
    .eq("id", matchId)
    .maybeSingle()
  if (fetchError) {
    return { ok: false, error: "Não foi possível carregar a partida." }
  }
  if (!match) {
    return { ok: false, error: "Partida não encontrada." }
  }

  const v1 = match.v1 as unknown as { user_id: string | null } | null
  const v2 = match.v2 as unknown as { user_id: string | null } | null
  if (v1?.user_id !== user.id && v2?.user_id !== user.id) {
    return { ok: false, error: "Você não joga esta partida." }
  }
  if (match.status === "encerrada") {
    return { ok: false, error: "Esta partida já está encerrada." }
  }
  if (!match.liberada_em || new Date(match.liberada_em).getTime() > Date.now()) {
    return { ok: false, error: "Esta rodada ainda não foi liberada." }
  }

  // Sobe a nova foto (a action constrói o path → sem forja).
  const up = await subirEvidencia(supabase, user.id, matchId, foto)
  if (!up.ok) {
    return { ok: false, error: up.error }
  }
  // Invariante: o path fica na pasta <uid>/<matchId>/ (a RLS de INSERT também
  // amarra a coluna foto_path). Guarda-corpo caso subirEvidencia mude.
  if (!up.path.startsWith(`${user.id}/${matchId}/`)) {
    Sentry.captureException(
      new Error("Invariante de pasta de evidência violado: foto_path fora de <uid>/<matchId>/"),
      { tags: { action: "proporPlacar", invariante: "foto_path_pasta" } }
    )
    await removerEvidencia(supabase, up.path)
    return { ok: false, error: ERRO_GENERICO }
  }

  // Reenvio: remove a própria pendente desta partida (policy DELETE) e a foto antiga.
  const { data: anterior } = await supabase
    .from("match_score_proposals")
    .select("id, foto_path")
    .eq("match_id", matchId)
    .eq("submetido_por", user.id)
    .eq("status", "pendente")
    .maybeSingle()
  if (anterior) {
    await supabase.from("match_score_proposals").delete().eq("id", anterior.id)
    if (anterior.foto_path) await removerEvidencia(supabase, anterior.foto_path)
  }

  const { error: insertError } = await supabase.from("match_score_proposals").insert({
    match_id: matchId,
    submetido_por: user.id,
    placar_1,
    placar_2,
    foto_path: up.path,
    // Autores propostos ficam guardados até a aprovação, quando a RPC
    // aprovar_proposta_placar os materializa em match_goals atomicamente. Cast
    // para Json: a lista tipada não casa com a index signature de Json, mas o
    // conteúdo (lado/jogador/gols) é serializável — o Zod já validou a forma.
    autores: (autores ?? null) as Json,
  })
  if (insertError) {
    await removerEvidencia(supabase, up.path) // rollback da foto órfã
    if (insertError.code === "23505") {
      return { ok: false, error: "Você já tem uma proposta pendente para esta partida." }
    }
    Sentry.captureException(insertError, { tags: { action: "proporPlacar" } })
    return { ok: false, error: ERRO_GENERICO }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${match.tournament_id}`)

  // Notifica o dono (aprovador principal), best-effort.
  const { data: torneio } = await supabase
    .from("tournaments")
    .select("created_by, titulo")
    .eq("id", match.tournament_id)
    .maybeSingle()
  await enviarNotificacoes(
    supabase,
    [torneio?.created_by],
    {
      title: "Placar para aprovar",
      body: `Há um placar aguardando aprovação em ${torneio?.titulo ?? "um torneio"}.`,
      url: `/dashboard/torneios/${match.tournament_id}`,
      tag: `torneio-${match.tournament_id}-proposta`,
    },
    user.id
  )

  return { ok: true }
}

/**
 * Aprovador aprova a proposta: o RPC aplica o placar + encerra a partida de
 * forma ATÔMICA (o trigger de mata-mata valida o conjunto e dá rollback em
 * empate), marca a proposta aprovada e rejeita as irmãs pendentes. Depois,
 * varredura de órfãos da rodada (best-effort, como em encerrarPartida).
 */
export async function aprovarPropostaPlacar(proposalId: unknown): Promise<PropostaResult> {
  const p = z.uuid().safeParse(proposalId)
  if (!p.success) {
    return { ok: false, error: "Proposta inválida." }
  }
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // Dados para revalidar/varrer e notificar (lidos ANTES; visíveis a quem arbitra).
  const { data: prop } = await supabase
    .from("match_score_proposals")
    .select("match_id, submetido_por")
    .eq("id", p.data)
    .maybeSingle()

  const { error } = await supabase.rpc("aprovar_proposta_placar", { p_proposal_id: p.data })
  if (error) {
    return { ok: false, error: mensagemErroRpc(error.message) }
  }

  if (prop) {
    const { data: mt } = await supabase
      .from("matches")
      .select("tournament_id, rodada")
      .eq("id", prop.match_id)
      .maybeSingle()
    if (mt) {
      revalidatePath("/dashboard")
      revalidatePath(`/dashboard/torneios/${mt.tournament_id}`)
      if (mt.rodada !== null) {
        try {
          await varrerOrfaosDaRodada(supabase, mt.tournament_id, mt.rodada, {
            somenteSeRodadaCompleta: true,
          })
        } catch (e) {
          Sentry.captureException(e, { tags: { action: "aprovarPropostaPlacar.varrerOrfaos" } })
        }
      }
      await enviarNotificacoes(
        supabase,
        [prop.submetido_por],
        {
          title: "Placar aprovado",
          body: "Seu placar foi aprovado e a partida foi encerrada.",
          url: `/dashboard/torneios/${mt.tournament_id}`,
          tag: `proposta-${p.data}`,
        },
        user.id
      )
    }
  }
  return { ok: true }
}

/** Aprovador rejeita a proposta (motivo opcional); o técnico pode reenviar. */
export async function rejeitarPropostaPlacar(input: RejeitarPropostaInput): Promise<PropostaResult> {
  const parsed = rejeitarPropostaSchema.safeParse(input)
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

  const { data: prop } = await supabase
    .from("match_score_proposals")
    .select("match_id, submetido_por")
    .eq("id", parsed.data.proposalId)
    .maybeSingle()

  const { error } = await supabase.rpc("rejeitar_proposta_placar", {
    p_proposal_id: parsed.data.proposalId,
    p_motivo: parsed.data.motivo ?? "",
  })
  if (error) {
    return { ok: false, error: mensagemErroRpc(error.message) }
  }

  if (prop) {
    const { data: mt } = await supabase
      .from("matches")
      .select("tournament_id")
      .eq("id", prop.match_id)
      .maybeSingle()
    if (mt) {
      revalidatePath("/dashboard")
      revalidatePath(`/dashboard/torneios/${mt.tournament_id}`)
      await enviarNotificacoes(
        supabase,
        [prop.submetido_por],
        {
          title: "Placar não aprovado",
          body: parsed.data.motivo
            ? `Motivo: ${parsed.data.motivo}`
            : "Reenvie o placar com a foto de evidência.",
          url: `/dashboard/torneios/${mt.tournament_id}`,
          tag: `proposta-${parsed.data.proposalId}`,
        },
        user.id
      )
    }
  }
  return { ok: true }
}
