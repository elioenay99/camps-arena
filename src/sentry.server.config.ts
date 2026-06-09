import * as Sentry from "@sentry/nextjs"

import { env } from "@/lib/env"
import {
  scrubBreadcrumb,
  scrubEvent,
  scrubTransactionEvent,
} from "@/lib/observability/scrub"

// Runtime Node (RSC, Server Actions, route handlers). É o config mais sensível:
// o FormData de `signup`/`atualizarPerfil` (celular) chega via POST aqui.
// `requestDataIntegration` com tudo `false` corta esse vetor na raiz; o
// `beforeSend` (scrub) é a rede de segurança. Sem DSN, init é no-op.
Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  maxValueLength: 250,
  tracesSampleRate: 0.1,
  integrations: [
    // `user` não é chave de `include` nesta versão — a anexação de user é
    // governada por `sendDefaultPii: false` (acima) + o scrub força `{id}`.
    Sentry.requestDataIntegration({
      include: {
        cookies: false,
        data: false,
        headers: false,
        ip: false,
        query_string: false,
      },
    }),
  ],
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubTransactionEvent,
  beforeBreadcrumb: scrubBreadcrumb,
})
