import "server-only"

import type { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import type { ItemPlanoFluxo } from "@/features/league/flowEngine"
import { resolverPremiosTemporada } from "@/features/league/data/resolverPremiosTemporada"
import { enviarNotificacoes } from "@/features/notifications/enviar"

type ServerClient = Awaited<ReturnType<typeof createClient>>

const ERRO_GENERICO = "Não foi possível confirmar o fluxo agora. Tente novamente."

/**
 * Push best-effort de "temporada encerrada" aos participantes (os holders dos
 * competidores que disputaram a temporada). Reusa `enviarNotificacoes` (contrato
 * que NUNCA lança e é no-op sem VAPID); gated por co-participação (os
 * destinatários saem dos próprios competidores da temporada).
 */
async function notificarTemporadaEncerrada(
  supabase: ServerClient,
  seasonId: string,
  callerId: string,
  itens: readonly ItemPlanoFluxo[]
): Promise<void> {
  const competitorIds = [...new Set(itens.map((it) => it.competitorId))]
  if (competitorIds.length === 0) return
  const { data: comps } = await supabase
    .from("league_competitors")
    .select("holder_user_id")
    .in("id", competitorIds)
  const destinatarios = (comps ?? []).map((c) => c.holder_user_id)
  await enviarNotificacoes(
    supabase,
    destinatarios,
    {
      title: "Temporada encerrada",
      body: "Veja o campeão, quem subiu e quem caiu.",
      url: `/dashboard/ligas/${seasonId}`,
      tag: `liga-${seasonId}-encerrada`,
    },
    callerId
  )
}

/**
 * Tail de `confirmarFluxoTemporada`: PREMIA (writer autoritativo) → FLIP para
 * 'encerrada' → PUSH best-effort. Extraído para travar a ORDEM por teste (o corpo
 * de `confirmarFluxoTemporada` não é testável ponta-a-ponta no Vitest porque chama
 * `calcularFluxoTemporada`/`montarProximaTemporada` — funções pesadas do MESMO
 * módulo, cujas chamadas internas o boundary do Vitest não intercepta).
 *
 * Invariantes GARANTIDAS pela ordem deste código (e cobertas por teste):
 *  1. A RPC `registrar_conquistas_temporada` roda com a season ainda 'em_fluxo'
 *     (as entries já foram congeladas pelo caller). Falha da RPC ⇒ retorno
 *     `{ ok: false }` ANTES do flip: a season permanece 'em_fluxo' e o re-run
 *     reexecuta o fluxo inteiro (o early-return de `confirmarFluxoTemporada` só
 *     dispara em 'encerrada').
 *  2. O flip para 'encerrada' é o ÚLTIMO write autoritativo.
 *  3. O push só sai DEPOIS do flip: se o flip falhar, nenhum aviso prematuro é
 *     disparado. Push é best-effort (`await`, sem redirect) e nunca derruba o
 *     encerramento já consumado.
 */
export async function premiarEEncerrarTemporada(
  supabase: ServerClient,
  seasonId: string,
  callerId: string,
  itens: readonly ItemPlanoFluxo[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  // (1) PREMIAÇÃO — ANTES do flip. Erro é FATAL (recuperável no re-run), nunca
  // deixa a estante meio-gravada num encerramento "bem-sucedido".
  try {
    const premios = await resolverPremiosTemporada(supabase, seasonId, itens)
    const { error: premiosError } = await supabase.rpc("registrar_conquistas_temporada", {
      p_season_id: seasonId,
      p_premios: premios as unknown as Json,
    })
    if (premiosError) {
      return { ok: false, error: ERRO_GENERICO }
    }
  } catch {
    return { ok: false, error: ERRO_GENERICO }
  }

  // (2) FLIP autoritativo: season → 'encerrada' (congela). Idempotente ('em_fluxo').
  const { error: encerrarError } = await supabase
    .from("league_seasons")
    .update({ status: "encerrada", encerrada_em: new Date().toISOString() })
    .eq("id", seasonId)
    .eq("status", "em_fluxo")
  if (encerrarError) {
    return { ok: false, error: ERRO_GENERICO }
  }

  // (3) PUSH best-effort — DEPOIS do flip. Falha é engolida.
  try {
    await notificarTemporadaEncerrada(supabase, seasonId, callerId, itens)
  } catch {
    // best-effort: push jamais derruba o encerramento já consumado.
  }

  return { ok: true }
}
