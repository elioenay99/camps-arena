import "server-only"

import webpush from "web-push"

import { env, vapidPrivateKey, vapidSubject } from "@/lib/env"
import type { createClient } from "@/lib/supabase/server"

type ServerClient = Awaited<ReturnType<typeof createClient>>

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

/** Sub achatada como as RPCs `subscriptions_de`/`subscriptions_para_nomeacao` devolvem. */
type SubLinha = { endpoint: string; p256dh: string; auth: string }

let vapidConfigurado = false

// Configura o web-push uma vez. Retorna false (no-op) se qualquer chave VAPID
// estiver ausente — degrade gracioso enquanto o dono não as configura no deploy.
function configurarVapid(): boolean {
  const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = vapidPrivateKey()
  const subject = vapidSubject()
  if (!publicKey || !privateKey || !subject) return false
  if (!vapidConfigurado) {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    vapidConfigurado = true
  }
  return true
}

/**
 * Núcleo de envio reusável (BEST-EFFORT): dado o array de subs já resolvido + o
 * payload, dispara cada notificação em paralelo e PODA as expiradas (404/410)
 * via `remover_push_endpoint`. NUNCA lança (todo o corpo está sob try/catch) e é
 * no-op se as VAPID não estão configuradas — para não derrubar a ação de
 * domínio que o chamou. As actions DEVEM `await` antes de qualquer `redirect()`
 * (em serverless a promessa solta é cortada).
 */
async function enviarParaSubs(
  supabase: ServerClient,
  subs: SubLinha[],
  payload: PushPayload
): Promise<void> {
  try {
    if (subs.length === 0) return
    if (!configurarVapid()) return

    const corpo = JSON.stringify(payload)
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            corpo
          )
        } catch (err) {
          const expirada =
            !!err &&
            typeof err === "object" &&
            "statusCode" in err &&
            (err.statusCode === 404 || err.statusCode === 410)
          if (expirada) {
            await supabase.rpc("remover_push_endpoint", { p_endpoint: sub.endpoint })
          }
        }
      })
    )
  } catch {
    // Best-effort: nenhuma falha de push pode derrubar a ação de domínio.
  }
}

/**
 * Envia uma notificação push aos `destinatarios` — BEST-EFFORT: NUNCA lança nem
 * bloqueia além do envio, para não derrubar a ação de domínio que a chamou.
 * Filtra ids nulos/duplicados e o próprio `callerId` (a RPC `subscriptions_de`
 * pode devolver a sub do caller). Lê as subs gated por co-participação e poda as
 * expiradas (404/410). As actions DEVEM `await` esta função ANTES de qualquer
 * `redirect()` (em serverless a promessa solta é cortada).
 */
export async function enviarNotificacoes(
  supabase: ServerClient,
  destinatarios: (string | null | undefined)[],
  payload: PushPayload,
  callerId: string
): Promise<void> {
  try {
    const ids = [...new Set(destinatarios)].filter(
      (id): id is string => !!id && id !== callerId
    )
    if (ids.length === 0) return

    const { data: subs, error } = await supabase.rpc("subscriptions_de", {
      p_user_ids: ids,
    })
    if (error || !subs || subs.length === 0) return

    await enviarParaSubs(supabase, subs, payload)
  } catch {
    // Best-effort: nenhuma falha de push pode derrubar a ação de domínio.
  }
}

/**
 * Notifica UM usuário recém-nomeado a um papel num campeonato (change
 * add-equipe-campeonato). Best-effort, MESMO contrato de `enviarNotificacoes`:
 * NUNCA lança, no-op sem VAPID. As subs vêm gated pela RPC
 * `subscriptions_para_nomeacao` (que valida o vínculo do destinatário com o
 * escopo/alvo antes de devolver qualquer endpoint).
 */
export async function enviarNomeacao(
  supabase: ServerClient,
  userId: string,
  escopo: "tournament" | "league",
  id: string,
  payload: PushPayload
): Promise<void> {
  try {
    const { data: subs, error } = await supabase.rpc("subscriptions_para_nomeacao", {
      p_user_id: userId,
      p_escopo: escopo,
      p_id: id,
    })
    if (error || !subs || subs.length === 0) return

    await enviarParaSubs(supabase, subs, payload)
  } catch {
    // Best-effort: nenhuma falha de push pode derrubar a ação de domínio.
  }
}
