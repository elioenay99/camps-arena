"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import {
  registrarAutoresLadoSchema,
  type RegistrarAutoresLadoInput,
} from "@/schema/matchSchema"

export type RegistrarAutoresLadoResult =
  | { ok: true; total: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> }

const ERRO_GENERICO = "Não foi possível registrar os autores agora. Tente novamente."

/** Códigos `raise exception` da RPC registrar_autores_lado → mensagem ao usuário. */
function mensagemErroRpc(message: string): string {
  const codigo =
    /(AUTH_REQUIRED|LADO_INVALIDO|MODO_INVALIDO|PARTIDA_INVALIDA|LADO_SEM_VAGA|NAO_AUTORIZADO|TETO_LADO)/.exec(
      message
    )?.[1] ?? ""
  switch (codigo) {
    case "AUTH_REQUIRED":
      return "Você precisa estar autenticado."
    case "LADO_INVALIDO":
      return "Lado inválido."
    case "MODO_INVALIDO":
      return "Modo de escrita inválido."
    case "PARTIDA_INVALIDA":
      return "Partida não encontrada."
    case "LADO_SEM_VAGA":
      return "Este lado não tem competidor — a artilharia colaborativa é só de partidas competitivas."
    case "NAO_AUTORIZADO":
      return "Você não pode editar os artilheiros deste lado."
    case "TETO_LADO":
      return "Os autores somam mais gols que o placar deste lado."
    default:
      return ERRO_GENERICO
  }
}

/**
 * Completa/corrige os autores de gols de UM lado de uma partida COMPETITIVA,
 * inclusive ENCERRADA (caminho ADITIVO ao lançamento inicial). Embrulha a RPC
 * `SECURITY DEFINER` `registrar_autores_lado` (que re-verifica auth, vaga,
 * autorização por MODO e o teto do lado) + Zod do payload por-lado. NÃO
 * reconstrói o existente: no `modo='append'` o `autores` recebido é SÓ o DELTA (a
 * RPC já soma o que está na tabela — reenviar o existente dobraria).
 */
export async function registrarAutoresLado(
  input: RegistrarAutoresLadoInput
): Promise<RegistrarAutoresLadoResult> {
  const parsed = registrarAutoresLadoSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: "Autores dos gols inválidos.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }
  const { matchId, lado, autores, modo } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { data: total, error } = await supabase.rpc("registrar_autores_lado", {
    p_match_id: matchId,
    p_lado: lado,
    // Cast p/ Json: a lista tipada não casa com a index signature de Json, mas o
    // conteúdo (jogador/gols/contra) é serializável — o Zod já validou a forma.
    p_autores: autores as unknown as Json,
    p_modo: modo,
  })
  if (error) {
    return { ok: false, error: mensagemErroRpc(error.message) }
  }

  // Revalida a página do torneio + a subárvore da liga (o ranking/carreira/badge
  // derivam de match_goals e renderizam na pirâmide e no perfil do competidor, sob
  // /dashboard/ligas — layout, já que a action não resolve a liga/competidor).
  const { data: match } = await supabase
    .from("matches")
    .select("tournament_id")
    .eq("id", matchId)
    .maybeSingle()
  revalidatePath("/dashboard")
  if (match) {
    revalidatePath(`/dashboard/torneios/${match.tournament_id}`)
  }
  revalidatePath("/dashboard/ligas", "layout")

  return { ok: true, total: total ?? 0 }
}
