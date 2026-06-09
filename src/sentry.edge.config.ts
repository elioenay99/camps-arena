import * as Sentry from "@sentry/nextjs"

import { env } from "@/lib/env"
import {
  scrubBreadcrumb,
  scrubEvent,
  scrubTransactionEvent,
} from "@/lib/observability/scrub"

// Runtime edge (o proxy.ts roda em edge; erros dele caem aqui via
// onRequestError). Edge não tem requestDataIntegration de Node — mínimo + scrub.
Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  maxValueLength: 250,
  tracesSampleRate: 0.1,
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubTransactionEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})
