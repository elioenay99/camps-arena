import "server-only"

import type { createClient } from "@/lib/supabase/server"

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

type EscopoTorneio = { tournamentId: string }
type EscopoLiga = { competitionId: string }
type Escopo = EscopoTorneio | EscopoLiga

type FnTorneio =
  | "pode_gerir_torneio"
  | "pode_arbitrar_torneio"
  | "pode_moderar_torneio"
  | "pode_ver_bastidores_torneio"
type FnComp =
  | "pode_gerir_competition"
  | "pode_arbitrar_competition"
  | "pode_moderar_competition"
  | "pode_ver_bastidores_competition"

/**
 * Checagem de capacidade no app-layer, delegando à fonte única no banco (funções
 * SECURITY DEFINER). É a defesa em profundidade junto da RLS: nega cedo com
 * mensagem precisa; a RLS continua barrando POST direto. Para torneios de divisão
 * de liga a herança já vem resolvida dentro da função do banco (liga_do_torneio).
 */
async function checar(
  supabase: SupabaseServer,
  fnTorneio: FnTorneio,
  fnComp: FnComp,
  escopo: Escopo
): Promise<boolean> {
  const { data, error } =
    "tournamentId" in escopo
      ? await supabase.rpc(fnTorneio, { p_tid: escopo.tournamentId })
      : await supabase.rpc(fnComp, { p_cid: escopo.competitionId })
  if (error) return false
  return data === true
}

/** Gerir (estrutura/ciclo): dono ou admin. */
export function podeGerir(supabase: SupabaseServer, escopo: Escopo) {
  return checar(supabase, "pode_gerir_torneio", "pode_gerir_competition", escopo)
}

/** Arbitrar (placar/W.O./rodadas): dono, admin ou árbitro. */
export function podeArbitrar(supabase: SupabaseServer, escopo: Escopo) {
  return checar(supabase, "pode_arbitrar_torneio", "pode_arbitrar_competition", escopo)
}

/** Moderar (convites/vagas/participantes): dono, admin ou moderador. */
export function podeModerar(supabase: SupabaseServer, escopo: Escopo) {
  return checar(supabase, "pode_moderar_torneio", "pode_moderar_competition", escopo)
}

/** Ver bastidores (visibilidade de gestão): dono ou qualquer membro/papel. */
export function podeVerBastidores(supabase: SupabaseServer, escopo: Escopo) {
  return checar(
    supabase,
    "pode_ver_bastidores_torneio",
    "pode_ver_bastidores_competition",
    escopo
  )
}
