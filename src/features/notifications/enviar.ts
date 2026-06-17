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
 * Envia uma notificação push aos `destinatarios` — BEST-EFFORT: NUNCA lança nem
 * bloqueia além do envio, para não derrubar a ação de domínio que a chamou
 * (todo o corpo está sob try/catch). Filtra ids nulos/duplicados e o próprio
 * `callerId` (a RPC `subscriptions_de` pode devolver a sub do caller). Lê as subs
 * gated por co-participação e poda as expiradas (404/410). As actions DEVEM
 * `await` esta função ANTES de qualquer `redirect()` (em serverless a promessa
 * solta é cortada).
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
    if (!configurarVapid()) return

    const { data: subs, error } = await supabase.rpc("subscriptions_de", {
      p_user_ids: ids,
    })
    if (error || !subs || subs.length === 0) return

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
