"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

/**
 * Boundary de ÚLTIMO recurso: pega erros que escapam dos error boundaries de
 * rota — inclusive falhas do próprio root layout. Como o layout falhou, ele
 * renderiza o próprio <html>/<body> (sem o shell do app). Reporta ao Sentry; o
 * scrub do client config redige PII de `error.message`. Estilo inline (mínimo,
 * robusto — não depende do CSS do app; coberto pelo style-src 'unsafe-inline').
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          background: "#0a0f0d",
          color: "#e8f0ec",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: "1.5rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Algo deu errado.
        </h1>
        <p style={{ color: "#9fb3aa", maxWidth: "28rem" }}>
          Tivemos um problema inesperado. Já fomos avisados — tente novamente.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            borderRadius: "9999px",
            border: "none",
            padding: "0.6rem 1.4rem",
            background: "#16a34a",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Recarregar
        </button>
      </body>
    </html>
  )
}
