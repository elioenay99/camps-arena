import * as Sentry from "@sentry/nextjs"

// Carrega o config do runtime certo no boot do servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

// Captura erros de Server Components, Server Actions, route handlers e do proxy.
export const onRequestError = Sentry.captureRequestError
