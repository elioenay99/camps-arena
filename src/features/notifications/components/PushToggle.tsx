"use client"

import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { subscribeUser, unsubscribeUser } from "@/actions/push"
import { Button } from "@/components/ui/button"
import { env } from "@/lib/env"

/**
 * Opt-in de Web Push (PWA Fase 3). Folha client mínima: estado da subscription
 * no `pushManager` + persistência via Server Actions (`subscribeUser`/
 * `unsubscribeUser`).
 *
 * Degrade gracioso (não quebra, só some/avisa) em três eixos:
 *  - sem suporte do browser OU sem `NEXT_PUBLIC_VAPID_PUBLIC_KEY` → renderiza
 *    null (a seção continua, mas o toggle não aparece);
 *  - com suporte mas SEM service worker registrado → estado "indisponível"
 *    (o SW só registra em produção; em dev `.ready` nunca resolve, por isso
 *    usamos `getRegistration("/")` e nunca `serviceWorker.ready`);
 *  - permissão negada pelo browser → toggle travado desligado com aviso.
 */

/** Suporte sincrono: precisa de SW + PushManager + chave VAPID pública. */
const SUPORTADO =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  !!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/**
 * Converte a chave VAPID base64url (sem padding) para o `Uint8Array` que o
 * `pushManager.subscribe` exige como `applicationServerKey`. Padrão dos docs
 * do Next: repõe o padding "=", troca o alfabeto url-safe e decodifica.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = atob(base64)
  // Backing por ArrayBuffer explícito: o `applicationServerKey` exige um
  // BufferSource sobre ArrayBuffer (não ArrayBufferLike/SharedArrayBuffer).
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length))
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

type Estado = "carregando" | "indisponivel" | "negado" | "ativo" | "inativo"

export function PushToggle() {
  const [estado, setEstado] = useState<Estado>("carregando")
  const [pendente, startTransition] = useTransition()

  // Estado inicial: existe SW registrado? Há subscription? Permissão negada?
  // O único setState vive no `.then` (callback async), nunca síncrono no effect.
  useEffect(() => {
    let cancelado = false
    // NUNCA serviceWorker.ready: em dev o SW não registra e .ready trava.
    async function resolver(): Promise<Estado> {
      if (!SUPORTADO) return "indisponivel"
      const reg = await navigator.serviceWorker.getRegistration("/")
      if (!reg) return "indisponivel"
      if (Notification.permission === "denied") return "negado"
      const sub = await reg.pushManager.getSubscription()
      return sub ? "ativo" : "inativo"
    }
    void resolver().then((proximo) => {
      if (!cancelado) setEstado(proximo)
    })
    return () => {
      cancelado = true
    }
  }, [])

  function ativar() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/")
      if (!reg) {
        setEstado("indisponivel")
        return
      }
      const perm = await Notification.requestPermission()
      if (perm !== "granted") {
        setEstado("negado")
        toast.error("Permissão de notificações negada pelo navegador.")
        return
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // SUPORTADO garante a chave; o `!` só satisfaz o tipo `| undefined`.
        applicationServerKey: urlBase64ToUint8Array(
          env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      })
      // Achata o PushSubscription para o shape plano que a action valida.
      const j = sub.toJSON()
      const r = await subscribeUser({
        endpoint: j.endpoint,
        p256dh: j.keys?.p256dh,
        auth: j.keys?.auth,
      })
      if (r.ok) {
        setEstado("ativo")
        toast.success("Notificações ativadas.")
      } else {
        // Não deixa subscription órfã no browser sem registro no servidor.
        await sub.unsubscribe().catch(() => {})
        setEstado("inativo")
        toast.error(r.error)
      }
    })
  }

  function desativar() {
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/")
      const sub = await reg?.pushManager.getSubscription()
      if (!sub) {
        setEstado("inativo")
        return
      }
      const endpoint = sub.endpoint
      await sub.unsubscribe().catch(() => {})
      const r = await unsubscribeUser(endpoint)
      if (r.ok) {
        setEstado("inativo")
        toast.success("Notificações desativadas.")
      } else {
        toast.error(r.error)
      }
    })
  }

  if (estado === "carregando") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        Verificando…
      </p>
    )
  }

  if (estado === "indisponivel") {
    return (
      <p className="text-muted-foreground text-sm">
        Disponível na versão publicada do app.
      </p>
    )
  }

  if (estado === "negado") {
    return (
      <p className="text-muted-foreground text-sm">
        As notificações foram bloqueadas pelo navegador. Libere a permissão nas
        configurações do site para ativá-las.
      </p>
    )
  }

  const ativo = estado === "ativo"

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={ativo ? "outline" : "default"}
        className="min-h-11 w-full px-4"
        disabled={pendente}
        aria-pressed={ativo}
        onClick={ativo ? desativar : ativar}
      >
        {pendente
          ? "Aguarde…"
          : ativo
            ? "Desativar notificações"
            : "Ativar notificações"}
      </Button>
      <p className="text-muted-foreground text-sm" role="status">
        {ativo
          ? "Notificações ativadas neste dispositivo."
          : "Notificações desativadas neste dispositivo."}
      </p>
    </div>
  )
}
