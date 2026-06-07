"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { FORMATOS_COM_CHAVE } from "@/features/knockout/gerarChaveMataMata"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { createClient } from "@/lib/supabase/server"
import {
  aceitarConviteSchema,
  regenerarConviteSchema,
  removerParticipanteSchema,
  sairDoTorneioSchema,
} from "@/schema/participantSchema"

export type ParticipantActionResult = { ok: true } | { ok: false; error: string }

export type AceitarConviteFormState = {
  error?: string
}

/**
 * Mensagens dos `raise exception` das funções do banco que são NOSSAS (pt-BR,
 * escritas em supabase/schema.sql) e seguras de repassar ao usuário. Qualquer
 * outro erro (permission denied, indisponibilidade) vira mensagem genérica —
 * não vazamos detalhes internos.
 */
const ERROS_CONHECIDOS_CONVITE = [
  "Convite inválido ou expirado",
  "Este torneio está encerrado e não aceita novos participantes",
  "Você precisa estar autenticado para aceitar um convite",
]

function mensagemDeErroDoConvite(message: string | undefined): string {
  const conhecida = ERROS_CONHECIDOS_CONVITE.find((erro) =>
    message?.includes(erro)
  )
  return conhecida ?? "Não foi possível aceitar o convite agora. Tente novamente."
}

/**
 * Aceita um convite de torneio (form action da página /convite/[codigo]).
 * A validação REAL do segredo acontece na função `aceitar_convite` do banco
 * (SECURITY DEFINER): código válido + torneio não-encerrado + insere SOMENTE
 * o próprio auth.uid(), idempotente. Aqui: Zod barra lixo óbvio e a sessão é
 * conferida para dar mensagem precisa (a função também rejeita sem sessão).
 */
export async function aceitarConvite(
  _prevState: AceitarConviteFormState,
  formData: FormData
): Promise<AceitarConviteFormState> {
  const parsed = aceitarConviteSchema.safeParse({
    codigo: formData.get("codigo"),
  })
  if (!parsed.success) {
    return { error: "Convite inválido ou expirado." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: "Sessão expirada. Entre novamente para aceitar o convite." }
  }

  let tournamentId: string
  try {
    const { data, error } = await supabase.rpc("aceitar_convite", {
      codigo: parsed.data.codigo,
    })
    if (error) {
      return { error: mensagemDeErroDoConvite(error.message) }
    }
    if (!data) {
      return { error: "Não foi possível aceitar o convite agora. Tente novamente." }
    }
    tournamentId = data
  } catch {
    return { error: "Não foi possível aceitar o convite agora. Tente novamente." }
  }

  // redirect() fora do try/catch (lança NEXT_REDIRECT).
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${tournamentId}`)
  redirect(`/dashboard/torneios/${tournamentId}`)
}

/**
 * Formato COM CHAVE (mata-mata, grupos, fase de liga) em andamento congela a
 * lista de participantes: o INSERT da chave — da fase seguinte, ou da chave
 * FUTURA no caso dos grupos — exige cada semeado em `participants` (cláusula
 * da RLS de INSERT de matches); uma saída no meio travaria o avanço/geração
 * PARA SEMPRE (RLS rejeita, retry nunca resolve, e o convite não readmite
 * fora de rascunho). O congelamento vale em ATIVO e também em ENCERRADO com
 * partidas geradas (achado da validação do add-tournament-closing: encerrar →
 * sair → reabrir recriaria exatamente o travamento) — participar de uma
 * disputa gerada é histórico do torneio. Liga não sofre (todas as partidas
 * nascem no Iniciar e não há chave futura); rascunho segue livre. A policy
 * `participants_delete_self_or_owner` é o backstop no banco.
 */
async function chaveEmAndamento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tournamentId: string
): Promise<{ travado: boolean } | { erro: true }> {
  const { data: torneio, error } = await supabase
    .from("tournaments")
    .select("id, status")
    .eq("id", tournamentId)
    .in("formato", [...FORMATOS_COM_CHAVE])
    .maybeSingle()
  if (error) {
    return { erro: true }
  }
  if (!torneio) {
    return { travado: false }
  }
  if (torneio.status === "ativo") {
    return { travado: true }
  }
  if (torneio.status === "rascunho") {
    return { travado: false }
  }
  // Encerrado: travado se a disputa chegou a ser gerada (reabrir devolve
  // 'ativo' e o avanço/geração voltaria a depender de todos os semeados).
  const { data: geradas, error: geradasError } = await supabase
    .from("matches")
    .select("id")
    .eq("tournament_id", tournamentId)
    .not("rodada", "is", null)
    .limit(1)
  if (geradasError) {
    return { erro: true }
  }
  return { travado: (geradas ?? []).length > 0 }
}

const ERRO_CHAVE_EM_ANDAMENTO =
  "A disputa deste torneio já foi gerada — os participantes fazem parte dela. Saídas e remoções só antes de iniciar."

/**
 * Sai do torneio por conta própria. O DELETE filtra pelo PRÓPRIO user.id —
 * não há como sair "pelos outros"; a RLS (`participants_delete_self_or_owner`)
 * é a segunda barreira. Partidas já criadas não são tocadas (histórico).
 */
export async function sairDoTorneio(
  input: unknown
): Promise<ParticipantActionResult> {
  const parsed = sairDoTorneioSchema.safeParse({ tournamentId: input })
  if (!parsed.success) {
    return { ok: false, error: "Torneio inválido." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const chave = await chaveEmAndamento(supabase, parsed.data.tournamentId)
  if ("erro" in chave) {
    return { ok: false, error: "Não foi possível sair do torneio agora. Tente novamente." }
  }
  if (chave.travado) {
    return { ok: false, error: ERRO_CHAVE_EM_ANDAMENTO }
  }

  const { data: removidas, error } = await supabase
    .from("participants")
    .delete()
    .eq("tournament_id", parsed.data.tournamentId)
    .eq("user_id", user.id)
    .select("user_id")
  if (error) {
    return { ok: false, error: "Não foi possível sair do torneio agora. Tente novamente." }
  }
  if (!removidas || removidas.length === 0) {
    return { ok: false, error: "Você não participa deste torneio." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data.tournamentId}`)
  return { ok: true }
}

/**
 * Remove um participante (gesto do DONO do torneio). Propriedade conferida
 * por FILTRO no servidor (torneio inexistente, alheio ou invisível recebem a
 * MESMA resposta — sem oráculo); RLS é a segunda barreira.
 */
export async function removerParticipante(
  input: unknown
): Promise<ParticipantActionResult> {
  const parsed = removerParticipanteSchema.safeParse(input)
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

  const erroPropriedade = "Torneio não encontrado ou você não é o dono dele."
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", parsed.data.tournamentId)
    .eq("created_by", user.id)
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: "Não foi possível remover o participante agora. Tente novamente." }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }
  // Mesmo congelamento de sairDoTorneio: remover participante de chave
  // gerada travaria o avanço de fase (ver chaveEmAndamento).
  const chave = await chaveEmAndamento(supabase, parsed.data.tournamentId)
  if ("erro" in chave) {
    return { ok: false, error: "Não foi possível remover o participante agora. Tente novamente." }
  }
  if (chave.travado) {
    return { ok: false, error: ERRO_CHAVE_EM_ANDAMENTO }
  }

  const { data: removidas, error } = await supabase
    .from("participants")
    .delete()
    .eq("tournament_id", parsed.data.tournamentId)
    .eq("user_id", parsed.data.userId)
    .select("user_id")
  if (error) {
    return { ok: false, error: "Não foi possível remover o participante agora. Tente novamente." }
  }
  if (!removidas || removidas.length === 0) {
    return { ok: false, error: "Este usuário não participa do torneio." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data.tournamentId}`)
  return { ok: true }
}

/**
 * Entra no PRÓPRIO torneio (dono que saiu e quer voltar, ou torneio criado
 * antes da entrada automática). INSERT direto coberto pela policy
 * `participants_insert_owner_self`; convidados entram só pelo convite.
 */
export async function participarDoProprioTorneio(
  input: unknown
): Promise<ParticipantActionResult> {
  const parsed = sairDoTorneioSchema.safeParse({ tournamentId: input })
  if (!parsed.success) {
    return { ok: false, error: "Torneio inválido." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroPropriedade =
    "Torneio não encontrado, encerrado ou você não é o dono dele."
  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", parsed.data.tournamentId)
    .eq("created_by", user.id)
    .neq("status", "encerrado")
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: "Não foi possível entrar no torneio agora. Tente novamente." }
  }
  if (!torneio) {
    return { ok: false, error: erroPropriedade }
  }

  // upsert + ignoreDuplicates = idempotente (já participa não é erro).
  const { error } = await supabase
    .from("participants")
    .upsert(
      { tournament_id: parsed.data.tournamentId, user_id: user.id },
      { onConflict: "tournament_id,user_id", ignoreDuplicates: true }
    )
  if (error) {
    return { ok: false, error: "Não foi possível entrar no torneio agora. Tente novamente." }
  }

  revalidatePath(`/dashboard/torneios/${parsed.data.tournamentId}`)
  return { ok: true }
}

/**
 * Gera (ou regenera) o código de convite do torneio — gesto do DONO.
 * Regenerar é UPSERT da MESMA linha (PK = tournament_id): o link antigo morre
 * atomicamente. Colisão do UNIQUE global do code (23505) é astronomicamente
 * improvável (80 bits), mas barata de tratar: um retry com código novo.
 */
export async function regenerarConvite(
  input: unknown
): Promise<ParticipantActionResult> {
  const parsed = regenerarConviteSchema.safeParse({ tournamentId: input })
  if (!parsed.success) {
    return { ok: false, error: "Torneio inválido." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: torneio, error: torneioError } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", parsed.data.tournamentId)
    .eq("created_by", user.id)
    .maybeSingle()
  if (torneioError) {
    return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
  }
  if (!torneio) {
    return { ok: false, error: "Torneio não encontrado ou você não é o dono dele." }
  }

  const TENTATIVAS = 2
  for (let i = 0; i < TENTATIVAS; i++) {
    const { error } = await supabase
      .from("tournament_invites")
      .upsert(
        { tournament_id: parsed.data.tournamentId, code: gerarCodigoConvite() },
        { onConflict: "tournament_id" }
      )
    if (!error) {
      revalidatePath(`/dashboard/torneios/${parsed.data.tournamentId}`)
      return { ok: true }
    }
    // 23505 = unique_violation (colisão global do code) → tenta outro código.
    if (error.code !== "23505") {
      return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
    }
  }
  return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
}
