"use server"

import * as Sentry from "@sentry/nextjs"
import { z } from "zod"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { enviarNotificacoes } from "@/features/notifications/enviar"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { createClient } from "@/lib/supabase/server"
import { codigoConviteSchema } from "@/schema/participantSchema"

export type SlotActionResult = { ok: true } | { ok: false; error: string }

export type AceitarConviteVagaFormState = {
  error?: string
}

const slotIdSchema = z.uuid({ error: "Vaga inválida." })
const tournamentIdSchema = z.uuid({ error: "Torneio inválido." })
const aceitarConviteVagaSchema = z.object({ codigo: codigoConviteSchema })

/**
 * Mapeia as exceções do RPC `aceitar_convite_vaga` (mensagens-código curtas,
 * cravadas em supabase/schema.sql) para texto pt-BR ao usuário. O 23505 vem do
 * unique parcial `slots_um_clube_por_tecnico` (já comanda outro clube). Erros
 * fora desta lista viram mensagem genérica — não vazamos detalhe interno.
 */
function mensagemDoAceiteDeVaga(error: {
  message?: string
  code?: string
}): string {
  if (error.code === "23505") {
    return "Você já comanda um clube neste torneio."
  }
  const m = error.message ?? ""
  if (m.includes("AUTH_REQUIRED")) {
    return "Você precisa estar autenticado para assumir a vaga."
  }
  if (m.includes("CONVITE_INVALIDO")) {
    return "Convite inválido ou expirado."
  }
  if (m.includes("TORNEIO_ENCERRADO")) {
    return "Este torneio está encerrado e não aceita novos técnicos."
  }
  if (m.includes("VAGA_OCUPADA")) {
    return "Este clube acabou de ganhar um técnico. Peça outro convite ao organizador."
  }
  return "Não foi possível assumir a vaga agora. Tente novamente."
}

/**
 * Assume a vaga de um clube (form action da página /convite/[codigo]). A
 * validação REAL acontece no RPC `aceitar_convite_vaga` (SECURITY DEFINER):
 * sessão + código válido + torneio não-encerrado + UPDATE atômico filtrado por
 * `user_id IS NULL` (serializa a corrida de dois aceites; quem perde recebe
 * VAGA_OCUPADA). O unique parcial barra quem já comanda outro clube (23505).
 */
export async function aceitarConviteVaga(
  _prevState: AceitarConviteVagaFormState,
  formData: FormData
): Promise<AceitarConviteVagaFormState> {
  const parsed = aceitarConviteVagaSchema.safeParse({
    codigo: formData.get("codigo"),
  })
  if (!parsed.success) {
    return { error: "Convite inválido ou expirado." }
  }

  const supabase = await createClient()

  let tournamentId: string
  try {
    const { data, error } = await supabase.rpc("aceitar_convite_vaga", {
      codigo: parsed.data.codigo,
    })
    if (error) {
      return { error: mensagemDoAceiteDeVaga(error) }
    }
    if (!data) {
      return { error: "Não foi possível assumir a vaga agora. Tente novamente." }
    }
    tournamentId = data
  } catch (error) {
    // Falha INESPERADA da RPC (o erro esperado já virou mensagem acima). Reporta
    // ao Sentry — o redirect (NEXT_REDIRECT) está fora do try.
    Sentry.captureException(error, { tags: { action: "aceitarConviteVaga" } })
    return { error: "Não foi possível assumir a vaga agora. Tente novamente." }
  }

  // redirect() fora do try/catch (lança NEXT_REDIRECT).
  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${tournamentId}`)

  // Notifica o DONO que entrou um técnico (best-effort; o await vem ANTES do
  // redirect — em serverless a promessa solta é cortada). A action não tinha o
  // user em mãos (o RPC usa auth.uid() por dentro): obtém aqui só para o
  // callerId. Corpo genérico (sem nome) para evitar PII.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { data: torneio } = await supabase
      .from("tournaments")
      .select("created_by, titulo")
      .eq("id", tournamentId)
      .maybeSingle()
    await enviarNotificacoes(
      supabase,
      [torneio?.created_by],
      {
        title: "Novo participante",
        body: `Alguém entrou no torneio ${torneio?.titulo ?? "sem título"}.`,
        url: `/dashboard/torneios/${tournamentId}`,
        tag: `torneio-${tournamentId}-convite`,
      },
      user.id
    )
  }

  redirect(`/dashboard/torneios/${tournamentId}`)
}

/**
 * Desiste da vaga (gesto do PRÓPRIO técnico). UPDATE filtrado pelo próprio
 * `auth.uid()` esvazia só a vaga que a pessoa comanda — não há como desistir
 * "pelos outros"; a policy `slots_update_tecnico_desiste` é a segunda barreira
 * (e barra em torneio encerrado → 0 linhas → mensagem genérica honesta). As
 * partidas não são tocadas (a vaga continua, o clube segue na disputa).
 */
export async function desistirDaVaga(
  input: unknown
): Promise<SlotActionResult> {
  const parsed = tournamentIdSchema.safeParse(input)
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

  const { data: esvaziadas, error } = await supabase
    .from("tournament_slots")
    .update({ user_id: null })
    .eq("tournament_id", parsed.data)
    .eq("user_id", user.id)
    .select("id")
  if (error) {
    return { ok: false, error: "Não foi possível desistir da vaga agora. Tente novamente." }
  }
  if (!esvaziadas || esvaziadas.length === 0) {
    return { ok: false, error: "Você não comanda nenhum clube neste torneio." }
  }

  revalidatePath("/dashboard")
  revalidatePath("/dashboard/torneios")
  revalidatePath(`/dashboard/torneios/${parsed.data}`)
  return { ok: true }
}

/**
 * Expulsa o técnico de uma vaga (gesto do DONO do torneio). Propriedade
 * conferida por FILTRO: do slot chego ao torneio e exijo `created_by = user`
 * ANTES (vaga inexistente, de torneio alheio ou invisível recebem a MESMA
 * resposta — sem oráculo). O UPDATE só esvazia (`user_id = null`); a policy
 * `slots_update_owner` (WITH CHECK user_id IS NULL) é o backstop. `.select()`
 * confirma a escrita.
 */
export async function expulsarTecnico(
  input: unknown
): Promise<SlotActionResult> {
  const parsed = slotIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Vaga inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const erroPropriedade = "Vaga não encontrada ou você não é o dono do torneio."
  const { data: slot, error: slotError } = await supabase
    .from("tournament_slots")
    .select("id, tournament_id, tournaments!inner(id)")
    .eq("id", parsed.data)
    .eq("tournaments.created_by", user.id)
    .maybeSingle()
  if (slotError) {
    return { ok: false, error: "Não foi possível expulsar o técnico agora. Tente novamente." }
  }
  if (!slot) {
    return { ok: false, error: erroPropriedade }
  }

  const { data: esvaziadas, error } = await supabase
    .from("tournament_slots")
    .update({ user_id: null })
    .eq("id", parsed.data)
    .select("id")
  if (error) {
    return { ok: false, error: "Não foi possível expulsar o técnico agora. Tente novamente." }
  }
  if (!esvaziadas || esvaziadas.length === 0) {
    // Propriedade já confirmada acima: 0 linhas indica corrida ou RLS
    // (ex.: torneio encerrado entre a checagem e o update), não falta de dono.
    return { ok: false, error: "Não foi possível expulsar o técnico agora. Tente novamente." }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${slot.tournament_id}`)
  return { ok: true }
}

/**
 * Gera (ou regenera) o código de convite de uma VAGA — gesto do DONO.
 * Propriedade por filtro (mesmo padrão de expulsarTecnico). Regenerar é UPSERT
 * da MESMA linha (PK = slot_id): o link antigo morre atomicamente. Colisão do
 * UNIQUE global do code (23505) é improvável (80 bits), mas barata: um retry.
 */
export async function regenerarConviteVaga(
  input: unknown
): Promise<SlotActionResult> {
  const parsed = slotIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Vaga inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: slot, error: slotError } = await supabase
    .from("tournament_slots")
    .select("id, tournament_id, team_id, tournaments!inner(id)")
    .eq("id", parsed.data)
    .eq("tournaments.created_by", user.id)
    .maybeSingle()
  if (slotError) {
    return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
  }
  if (!slot) {
    return { ok: false, error: "Vaga não encontrada ou você não é o dono do torneio." }
  }
  // Vaga por NOME (sem clube) não usa convite — o organizador lança os placares.
  // A trava REAL é no banco (trigger + RLS); aqui é a mensagem clara, antes de
  // tocar slot_invites (a UI já esconde o botão neste caso).
  if (slot.team_id === null) {
    return { ok: false, error: "Vagas por nome não usam convite." }
  }

  const TENTATIVAS = 2
  for (let i = 0; i < TENTATIVAS; i++) {
    const { error } = await supabase
      .from("slot_invites")
      .upsert(
        { slot_id: parsed.data, code: gerarCodigoConvite() },
        { onConflict: "slot_id" }
      )
    if (!error) {
      revalidatePath(`/dashboard/torneios/${slot.tournament_id}`)
      return { ok: true }
    }
    // 23505 = unique_violation (colisão global do code) → tenta outro código.
    if (error.code !== "23505") {
      return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
    }
  }
  return { ok: false, error: "Não foi possível gerar o convite agora. Tente novamente." }
}

/**
 * O DONO assume para SI uma vaga vazia. Atribuição de técnico tem um caminho
 * ÚNICO (D4): o RPC `aceitar_convite_vaga`. Aqui o dono lê o código da própria
 * vaga (a RLS de `slot_invites` deixa o dono ler) e aciona o mesmo RPC — sem
 * UPDATE direto de `user_id` (que as policies de slots proíbem de propósito).
 */
export async function assumirVagaComoDono(
  input: unknown
): Promise<SlotActionResult> {
  const parsed = slotIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Vaga inválida." }
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  // A RLS de slot_invites só deixa o DONO ler o código: a leitura é a própria
  // checagem de propriedade (não-dono → 0 linhas → mensagem única, sem oráculo).
  const { data: convite, error: conviteError } = await supabase
    .from("slot_invites")
    .select("code")
    .eq("slot_id", parsed.data)
    .maybeSingle()
  if (conviteError) {
    return { ok: false, error: "Não foi possível assumir a vaga agora. Tente novamente." }
  }
  if (!convite) {
    return {
      ok: false,
      error: "Vaga não encontrada, sem convite gerado ou você não é o dono do torneio.",
    }
  }

  let tournamentId: string
  try {
    const { data, error } = await supabase.rpc("aceitar_convite_vaga", {
      codigo: convite.code,
    })
    if (error) {
      return { ok: false, error: mensagemDoAceiteDeVaga(error) }
    }
    if (!data) {
      return { ok: false, error: "Não foi possível assumir a vaga agora. Tente novamente." }
    }
    tournamentId = data
  } catch (error) {
    // Falha INESPERADA da RPC (o erro esperado já virou mensagem acima). Reporta
    // ao Sentry — o redirect (NEXT_REDIRECT) está fora do try.
    Sentry.captureException(error, { tags: { action: "assumirVagaComoDono" } })
    return { ok: false, error: "Não foi possível assumir a vaga agora. Tente novamente." }
  }

  revalidatePath("/dashboard")
  revalidatePath(`/dashboard/torneios/${tournamentId}`)
  return { ok: true }
}
