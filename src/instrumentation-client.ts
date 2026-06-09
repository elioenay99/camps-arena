import * as Sentry from "@sentry/nextjs"

import { env } from "@/lib/env"
import {
  scrubBreadcrumb,
  scrubEvent,
  scrubTransactionEvent,
} from "@/lib/observability/scrub"

// Runtime client (browser). Convenção nativa do Next 16 (substitui o antigo
// sentry.client.config). Replay DESLIGADO (sample rates 0) — /dashboard/conta
// mostra nome/celular/avatar; gravar o DOM seria o maior vetor de PII visual.
// Sem DSN, init é no-op.
Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  maxValueLength: 250,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubTransactionEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})

// Instrumenta as navegações do client router (Next 16).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
