"use server"

import { z } from "zod"

import { createClient } from "@/lib/supabase/server"

// O PushSubscription.toJSON() é achatado pelo cliente para este shape plano.
const subscriptionSchema = z.object({
  endpoint: z.url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
})

export type PushActionResult = { ok: true } | { ok: false; error: string }

/**
 * Persiste (ou atualiza) a subscription de push do próprio usuário. Idempotente
 * por (user_id, endpoint): re-inscrição do mesmo device renova as chaves — exige
 * a policy de UPDATE (RLS) em push_subscriptions.
 */
export async function subscribeUser(sub: unknown): Promise<PushActionResult> {
  const parsed = subscriptionSchema.safeParse(sub)
  if (!parsed.success) return { ok: false, error: "Inscrição inválida." }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
    },
    { onConflict: "user_id,endpoint" }
  )
  if (error) {
    return { ok: false, error: "Não foi possível ativar as notificações." }
  }
  return { ok: true }
}

/** Remove a subscription do próprio usuário (RLS garante o escopo). */
export async function unsubscribeUser(endpoint: unknown): Promise<PushActionResult> {
  const parsed = z.string().min(1).safeParse(endpoint)
  if (!parsed.success) return { ok: false, error: "Endpoint inválido." }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "Você precisa estar autenticado." }
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", parsed.data)
  if (error) {
    return { ok: false, error: "Não foi possível desativar as notificações." }
  }
  return { ok: true }
}
