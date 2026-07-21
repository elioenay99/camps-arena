"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { podeGerir } from "@/lib/autorizacao"
import { removerEscudoCustom, subirEscudoCustom } from "@/lib/escudoCustom"
import { createClient } from "@/lib/supabase/server"

/**
 * Escudo PERSONALIZADO do competidor, LOCAL à liga (change
 * escudo-personalizado-liga). O catálogo global `public.teams` NUNCA é tocado
 * aqui: o override mora em `league_competitors.escudo_url` e vale só naquela
 * pirâmide.
 *
 * Autorização em duas camadas, como o resto do projeto: `podeGerir` (dono OU
 * admin) como pré-check com mensagem precisa, e a RLS
 * (`league_competitors_update_owner` → `pode_gerir_competition`) como backstop
 * contra POST direto via anon key.
 */

export type EscudoCompetidorResult =
  | { ok: true; escudoUrl: string | null }
  | { ok: false; error: string }

/** Mesma mensagem para "não existe" e "sem acesso" — não vira oráculo de existência. */
const SEM_ACESSO = "Competidor não encontrado ou você não tem acesso a esta ação."

const idSchema = z.uuid({ error: "Competidor inválido." })
const seasonSchema = z.uuid({ error: "Temporada inválida." })

/**
 * Resolve a liga do competidor e confere a capacidade GERIR. Devolve o
 * `competition_id` e o escudo ATUAL (necessário para apagar o arquivo anterior).
 */
async function autorizar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competitorId: string
): Promise<
  { ok: true; competitionId: string; escudoAtual: string | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("league_competitors")
    .select("competition_id, escudo_url")
    .eq("id", competitorId)
    .maybeSingle()
  if (error) {
    console.error("[escudoCompetidor] leitura", error.code ?? error.message)
    return { ok: false, error: "Não foi possível carregar o competidor agora." }
  }
  if (!data) return { ok: false, error: SEM_ACESSO }

  if (!(await podeGerir(supabase, { competitionId: data.competition_id }))) {
    return { ok: false, error: SEM_ACESSO }
  }
  return { ok: true, competitionId: data.competition_id, escudoAtual: data.escudo_url }
}

/**
 * `seasonId` NÃO participa da autorização — serve só para revalidar as rotas da
 * temporada de onde o formulário foi submetido (em `/dashboard/ligas/[id]`, `[id]`
 * é o id da SEASON, não o da competição).
 */
function revalidar(seasonId: string | null) {
  revalidatePath("/dashboard/ligas")
  if (seasonId) {
    revalidatePath(`/dashboard/ligas/${seasonId}`)
    revalidatePath(`/dashboard/ligas/${seasonId}/cores`)
  }
}

export async function definirEscudoCompetidor(
  competitorId: unknown,
  formData: FormData
): Promise<EscudoCompetidorResult> {
  const parsedId = idSchema.safeParse(competitorId)
  if (!parsedId.success) return { ok: false, error: "Competidor inválido." }

  const seasonBruto = formData.get("seasonId")
  const parsedSeason = seasonSchema.safeParse(seasonBruto)
  const seasonId = parsedSeason.success ? parsedSeason.data : null

  const arquivo = formData.get("escudo")
  if (!(arquivo instanceof File)) return { ok: false, error: "Selecione uma imagem." }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: "Você precisa estar autenticado." }

  const autz = await autorizar(supabase, parsedId.data)
  if (!autz.ok) return autz

  const upload = await subirEscudoCustom(supabase, parsedId.data, arquivo)
  if (!upload.ok) return upload

  const { data: atualizados, error: updateError } = await supabase
    .from("league_competitors")
    .update({ escudo_url: upload.url })
    .eq("id", parsedId.data)
    .select("id")
  if (updateError) {
    // Arquivo já subiu e o banco não aceitou: não deixa órfão para trás.
    await removerEscudoCustom(supabase, upload.url)
    console.error("[escudoCompetidor] update", updateError.code ?? updateError.message)
    return { ok: false, error: "Não foi possível salvar o escudo agora. Tente novamente." }
  }
  if (!atualizados || atualizados.length === 0) {
    await removerEscudoCustom(supabase, upload.url)
    return { ok: false, error: SEM_ACESSO }
  }

  // Só DEPOIS do UPDATE confirmado. A ordem inversa deixaria escudo quebrado se o
  // UPDATE falhasse; aqui o pior caso é um órfão de ≤256KB.
  await removerEscudoCustom(supabase, autz.escudoAtual)

  revalidar(seasonId)
  return { ok: true, escudoUrl: upload.url }
}

export async function removerEscudoCompetidor(
  competitorId: unknown,
  seasonId: unknown
): Promise<EscudoCompetidorResult> {
  const parsedId = idSchema.safeParse(competitorId)
  if (!parsedId.success) return { ok: false, error: "Competidor inválido." }
  const parsedSeason = seasonSchema.safeParse(seasonId)

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { ok: false, error: "Você precisa estar autenticado." }

  const autz = await autorizar(supabase, parsedId.data)
  if (!autz.ok) return autz

  const { data: atualizados, error: updateError } = await supabase
    .from("league_competitors")
    .update({ escudo_url: null })
    .eq("id", parsedId.data)
    .select("id")
  if (updateError) {
    console.error("[escudoCompetidor] remover", updateError.code ?? updateError.message)
    return { ok: false, error: "Não foi possível remover o escudo agora. Tente novamente." }
  }
  if (!atualizados || atualizados.length === 0) return { ok: false, error: SEM_ACESSO }

  await removerEscudoCustom(supabase, autz.escudoAtual)

  revalidar(parsedSeason.success ? parsedSeason.data : null)
  return { ok: true, escudoUrl: null }
}
