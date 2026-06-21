"use server"

import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"

import { enviarNomeacao } from "@/features/notifications/enviar"
import { podeGerir } from "@/lib/autorizacao"
import { gerarCodigoConvite } from "@/lib/invite-code"
import { createClient } from "@/lib/supabase/server"
import {
  aceitarConviteMembroSchema,
  adicionarMembroSchema,
  buscarUsuariosSchema,
  gerarConviteMembroSchema,
  removerConviteMembroSchema,
  removerMembroSchema,
  sairDaEquipeSchema,
  type Escopo,
  type PapelMembro,
} from "@/schema/equipe"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type EquipeActionResult = { ok: true } | { ok: false; error: string }

/** Mensagem genérica padrão (sem oráculo). */
const ERRO_GENERICO = "Não foi possível concluir a ação agora. Tente novamente."
const ERRO_GESTAO = "Campeonato não encontrado ou você não pode gerenciá-lo."

/** Argumento de escopo no formato que `podeGerir`/autorizacao esperam. */
function escopoAutorizacao(escopo: Escopo, id: string) {
  return escopo === "tournament" ? { tournamentId: id } : { competitionId: id }
}

/** URL pública do campeonato (destino do push de nomeação e do redirect). */
function urlCampeonato(escopo: Escopo, id: string): string {
  return escopo === "tournament"
    ? `/dashboard/torneios/${id}`
    : `/dashboard/ligas/${id}`
}

/** Revalida as rotas afetadas: o campeonato e a subpágina de equipe. */
function revalidarCampeonato(escopo: Escopo, id: string): void {
  const base = urlCampeonato(escopo, id)
  revalidatePath(base)
  revalidatePath(`${base}/equipe`)
}

const ROTULO_PAPEL: Record<PapelMembro, string> = {
  admin: "administrador",
  arbitro: "árbitro",
  moderador: "moderador",
}

/** Lê o título do campeonato para compor o corpo da notificação (best-effort). */
async function tituloCampeonato(
  supabase: ServerClient,
  escopo: Escopo,
  id: string
): Promise<string> {
  if (escopo === "tournament") {
    const { data } = await supabase
      .from("tournaments")
      .select("titulo")
      .eq("id", id)
      .maybeSingle()
    return data?.titulo ?? "um campeonato"
  }
  const { data } = await supabase
    .from("league_competitions")
    .select("nome")
    .eq("id", id)
    .maybeSingle()
  return data?.nome ?? "um campeonato"
}

/** Dispara o push "Você virou <papel> em <nome>" (best-effort, nunca lança). */
async function notificarNomeacao(
  supabase: ServerClient,
  escopo: Escopo,
  id: string,
  userId: string,
  papel: PapelMembro
): Promise<void> {
  const titulo = await tituloCampeonato(supabase, escopo, id)
  await enviarNomeacao(supabase, userId, escopo, id, {
    title: `Você virou ${ROTULO_PAPEL[papel]} em ${titulo}`,
    body: "Toque para abrir os bastidores do campeonato.",
    url: urlCampeonato(escopo, id),
    tag: `nomeacao-${escopo}-${id}`,
  })
}

export type GerarConviteMembroResult =
  | { ok: true; code: string }
  | { ok: false; error: string }

/**
 * Gera (regenera) o LINK de convite de um papel (árbitro/moderador) para o
 * campeonato. Admin NUNCA sai por link — é rejeitado pelo Zod (papelConvite).
 *
 * Regenerar substitui o link antigo: DELETE do convite existente daquele
 * (escopo, alvo, papel) + INSERT de um code novo. Uma só linha viva por papel; o
 * DELETE mata o link anterior do ponto de vista do usuário. Capacidade GERIR no
 * app-layer; a RLS é o backstop. Colisão do UNIQUE global do code (23505,
 * ~impossível com 80 bits) → tenta outro código; depois desiste.
 */
export async function gerarConviteMembro(
  escopo: unknown,
  id: unknown,
  papel: unknown
): Promise<GerarConviteMembroResult> {
  const parsed = gerarConviteMembroSchema.safeParse({ escopo, id, papel })
  if (!parsed.success) {
    return { ok: false, error: "Dados do convite inválidos." }
  }
  const { escopo: esc, id: alvoId, papel: papelConvite } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  if (!(await podeGerir(supabase, escopoAutorizacao(esc, alvoId)))) {
    return { ok: false, error: ERRO_GESTAO }
  }

  // Mata o link anterior daquele papel (idempotente). O alvo entra como
  // tournament_id OU competition_id conforme o escopo; o filtro `escopo` já
  // discrimina, mas restringimos a coluna certa por clareza/precisão.
  let del = supabase
    .from("member_invites")
    .delete()
    .eq("escopo", esc)
    .eq("papel", papelConvite)
  del = esc === "tournament" ? del.eq("tournament_id", alvoId) : del.eq("competition_id", alvoId)
  const { error: deleteError } = await del
  if (deleteError) {
    return { ok: false, error: ERRO_GENERICO }
  }

  const TENTATIVAS = 2
  for (let i = 0; i < TENTATIVAS; i++) {
    const code = gerarCodigoConvite()
    // Branches separadas: o overload de insert rejeita o UNION dos dois shapes
    // (a chave ausente vira `?: undefined`, lida como prop excedente) — cada
    // ramo passa um literal concreto.
    const { error: insertError } =
      esc === "tournament"
        ? await supabase
            .from("member_invites")
            .insert({ escopo: esc, tournament_id: alvoId, papel: papelConvite, code, created_by: user.id })
        : await supabase
            .from("member_invites")
            .insert({ escopo: esc, competition_id: alvoId, papel: papelConvite, code, created_by: user.id })
    if (!insertError) {
      revalidarCampeonato(esc, alvoId)
      return { ok: true, code }
    }
    if (insertError.code !== "23505") {
      return { ok: false, error: ERRO_GENERICO }
    }
  }
  return { ok: false, error: ERRO_GENERICO }
}

/**
 * Remove o LINK de convite de um papel (árbitro/moderador). Idempotente: 0
 * linhas afetadas = já não existe = ok. Capacidade GERIR; RLS é o backstop.
 */
export async function removerConviteMembro(
  escopo: unknown,
  id: unknown,
  papel: unknown
): Promise<EquipeActionResult> {
  const parsed = removerConviteMembroSchema.safeParse({ escopo, id, papel })
  if (!parsed.success) {
    return { ok: false, error: "Dados do convite inválidos." }
  }
  const { escopo: esc, id: alvoId, papel: papelConvite } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  if (!(await podeGerir(supabase, escopoAutorizacao(esc, alvoId)))) {
    return { ok: false, error: ERRO_GESTAO }
  }

  let del = supabase
    .from("member_invites")
    .delete()
    .eq("escopo", esc)
    .eq("papel", papelConvite)
  del = esc === "tournament" ? del.eq("tournament_id", alvoId) : del.eq("competition_id", alvoId)
  const { error } = await del
  if (error) {
    return { ok: false, error: ERRO_GENERICO }
  }

  revalidarCampeonato(esc, alvoId)
  return { ok: true }
}

/**
 * Adiciona um membro DIRETAMENTE (admin/arbitro/moderador) — nomeação por busca
 * de nome, sem link. Capacidade GERIR no app-layer; a RLS é a barreira REAL:
 * para `papel='admin'` a policy exige DONO (não só gestor), então o INSERT
 * FALHA para não-donos — traduzimos esse erro em mensagem precisa. Após inserir,
 * dispara o push de nomeação (best-effort). Idempotente: re-nomear o mesmo
 * usuário (mesmo/novo papel) faz upsert da linha sem falhar.
 */
export async function adicionarMembro(
  escopo: unknown,
  id: unknown,
  userId: unknown,
  papel: unknown
): Promise<EquipeActionResult> {
  const parsed = adicionarMembroSchema.safeParse({ escopo, id, userId, papel })
  if (!parsed.success) {
    return { ok: false, error: "Dados da nomeação inválidos." }
  }
  const { escopo: esc, id: alvoId, userId: alvoUser, papel: papelMembro } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  if (!(await podeGerir(supabase, escopoAutorizacao(esc, alvoId)))) {
    return { ok: false, error: ERRO_GESTAO }
  }

  const { error } =
    esc === "tournament"
      ? await supabase.from("tournament_members").upsert(
          { tournament_id: alvoId, user_id: alvoUser, papel: papelMembro, created_by: user.id },
          { onConflict: "tournament_id,user_id" }
        )
      : await supabase.from("league_members").upsert(
          { competition_id: alvoId, user_id: alvoUser, papel: papelMembro, created_by: user.id },
          { onConflict: "competition_id,user_id" }
        )
  if (error) {
    // RLS de admin exige DONO: o gestor não-dono cai aqui. Mensagem precisa só
    // quando o papel pedido é admin; demais erros viram genérico (sem oráculo).
    if (papelMembro === "admin") {
      return { ok: false, error: "Só o dono pode adicionar administradores." }
    }
    return { ok: false, error: ERRO_GENERICO }
  }

  // Push de nomeação (await ANTES de retornar — em serverless promessa solta é
  // cortada). Best-effort: nunca lança, não afeta o resultado.
  await notificarNomeacao(supabase, esc, alvoId, alvoUser, papelMembro)

  revalidarCampeonato(esc, alvoId)
  return { ok: true }
}

/**
 * Remove um membro pelo seu user_id. Capacidade GERIR; remover ADMIN é dono-only
 * — a RLS cuida (o DELETE não afeta linha de admin para gestor não-dono → 0
 * linhas, idempotente sem oráculo). Idempotente: 0 linhas = ok.
 */
export async function removerMembro(
  escopo: unknown,
  id: unknown,
  userId: unknown
): Promise<EquipeActionResult> {
  const parsed = removerMembroSchema.safeParse({ escopo, id, userId })
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos." }
  }
  const { escopo: esc, id: alvoId, userId: alvoUser } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  if (!(await podeGerir(supabase, escopoAutorizacao(esc, alvoId)))) {
    return { ok: false, error: ERRO_GESTAO }
  }

  const { error } =
    esc === "tournament"
      ? await supabase
          .from("tournament_members")
          .delete()
          .eq("tournament_id", alvoId)
          .eq("user_id", alvoUser)
      : await supabase
          .from("league_members")
          .delete()
          .eq("competition_id", alvoId)
          .eq("user_id", alvoUser)
  if (error) {
    return { ok: false, error: ERRO_GENERICO }
  }

  revalidarCampeonato(esc, alvoId)
  return { ok: true }
}

/**
 * Sai da equipe por conta própria: remove a PRÓPRIA linha (user_id = auth.uid()).
 * Sem checagem de capacidade — qualquer membro pode se retirar. A RLS garante o
 * escopo (só a própria linha). Idempotente: 0 linhas = não era membro = ok.
 */
export async function sairDaEquipe(
  escopo: unknown,
  id: unknown
): Promise<EquipeActionResult> {
  const parsed = sairDaEquipeSchema.safeParse({ escopo, id })
  if (!parsed.success) {
    return { ok: false, error: "Dados inválidos." }
  }
  const { escopo: esc, id: alvoId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { error } =
    esc === "tournament"
      ? await supabase
          .from("tournament_members")
          .delete()
          .eq("tournament_id", alvoId)
          .eq("user_id", user.id)
      : await supabase
          .from("league_members")
          .delete()
          .eq("competition_id", alvoId)
          .eq("user_id", user.id)
  if (error) {
    return { ok: false, error: ERRO_GENERICO }
  }

  revalidarCampeonato(esc, alvoId)
  return { ok: true }
}

export type AceitarConviteMembroResult =
  | { ok: true; escopo: Escopo; alvoId: string }
  | { ok: false; error: string }

/**
 * Aceita um convite de membro pelo código (ação da página de convite). A
 * validação REAL acontece na RPC `aceitar_convite_membro` (SECURITY DEFINER):
 * código válido + insere SOMENTE o próprio auth.uid() no papel do convite,
 * idempotente. Devolve { escopo, alvoId } para o redirect do chamador. Não há
 * push de nomeação: quem aceita já está no app e não precisa se auto-notificar.
 */
export async function aceitarConviteMembro(
  code: unknown
): Promise<AceitarConviteMembroResult> {
  const parsed = aceitarConviteMembroSchema.safeParse({ code })
  if (!parsed.success) {
    return { ok: false, error: "Convite inválido ou expirado." }
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Sessão expirada. Entre novamente para aceitar o convite." }
  }

  let escopo: Escopo
  let alvoId: string
  try {
    const { data, error } = await supabase.rpc("aceitar_convite_membro", {
      p_code: parsed.data.code,
    })
    if (error) {
      return { ok: false, error: "Não foi possível aceitar o convite agora. Tente novamente." }
    }
    const linha = data?.[0]
    if (!linha) {
      return { ok: false, error: "Convite inválido ou expirado." }
    }
    // A RPC devolve escopo/alvo crus — normaliza para o tipo do app.
    escopo = linha.escopo === "league" ? "league" : "tournament"
    alvoId = linha.alvo_id
  } catch (error) {
    Sentry.captureException(error, { tags: { action: "aceitarConviteMembro" } })
    return { ok: false, error: "Não foi possível aceitar o convite agora. Tente novamente." }
  }

  revalidarCampeonato(escopo, alvoId)

  return { ok: true, escopo, alvoId }
}

export type UsuarioBusca = { id: string; nome: string | null; avatar: string | null }

/**
 * Busca usuários por nome (view `users_public` — id/nome/avatar SEM PII). Exige
 * 2+ caracteres (retorna [] abaixo disso, sem consultar). Exclui o próprio
 * caller dos resultados. Limite de 8. Autenticada (a RLS da view também barra
 * anônimo). NUNCA retorna celular/email.
 */
export async function buscarUsuarios(query: unknown): Promise<UsuarioBusca[]> {
  // Short-circuit antes do Zod: <2 chars (ou não-string) = lista vazia.
  if (typeof query !== "string" || query.trim().length < 2) {
    return []
  }
  const parsed = buscarUsuariosSchema.safeParse({ query: query.trim() })
  if (!parsed.success) {
    return []
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return []
  }

  // Escapa os curingas do LIKE (% e _) e o escape char (\) para tratar a busca
  // como texto literal — sem isto "%" listaria todo mundo.
  const termo = parsed.data.query.replace(/[\\%_]/g, (m) => `\\${m}`)

  const { data, error } = await supabase
    .from("users_public")
    .select("id, nome, avatar")
    .ilike("nome", `%${termo}%`)
    .neq("id", user.id)
    .limit(8)
  if (error || !data) {
    return []
  }
  return data
}
