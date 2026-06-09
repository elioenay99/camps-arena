import { z } from "zod"

/**
 * Contrato e validação fail-fast das variáveis de ambiente de runtime.
 *
 * O parse roda no LOAD deste módulo: env inválida derruba o build/boot com
 * mensagem nomeando cada variável, em vez de quebrar em runtime na primeira
 * request (`next.config.ts` importa este módulo por side-effect para falhar
 * já no início do build). Nenhum outro arquivo de `src/` lê `process.env`.
 *
 * `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` ficam fora do contrato: são
 * de uso administrativo/CLI fora do runtime Next (ver `.env.example`).
 */
// `z.url()` sem params aceita qualquer esquema (javascript:, ftp:) — restringe
// a http(s); http permitido pelo dev local (localhost:3000).
const urlHttp = { protocol: /^https?$/, error: "deve ser uma URL http(s) válida." }

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(urlHttp),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // URL canônica do site (metadados/OG). Default preserva o dev local.
  NEXT_PUBLIC_SITE_URL: z.url(urlHttp).default("http://localhost:3000"),
  // DSN do Sentry (público por design — vai no bundle client). OPCIONAL: sem
  // ele a instrumentação é no-op (Sentry.init(undefined) não envia nada).
  NEXT_PUBLIC_SENTRY_DSN: z.url(urlHttp).optional(),
})

export type Env = z.infer<typeof envSchema>

/**
 * Valida o objeto cru de ambiente. Campos em branco (`VAR=` no .env) contam
 * como AUSENTES — sem isso, `""` viraria "URL inválida" em vez de "ausente"
 * e passaria num `min(1)` de chave.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const semVazios = Object.fromEntries(
    Object.entries(raw).filter(([, valor]) => valor !== "" && valor !== undefined)
  )
  const parsed = envSchema.safeParse(semVazios)
  if (!parsed.success) {
    const linhas = parsed.error.issues
      .map((issue) => {
        const variavel = issue.path.join(".")
        const motivo = variavel in semVazios ? issue.message : "ausente"
        return `  - ${variavel}: ${motivo}`
      })
      .join("\n")
    throw new Error(
      `Variáveis de ambiente inválidas (confira o .env.local — modelo em .env.example):\n${linhas}`
    )
  }
  return parsed.data
}

/**
 * Referências ESTÁTICAS, campo a campo: o inlining do Next em client bundles
 * só substitui `process.env.NEXT_PUBLIC_X` literal (nunca acesso dinâmico).
 */
export const env = parseEnv({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
})

/**
 * `API_FOOTBALL_KEY` é opcional e server-only — fica FORA do parse eager:
 * a busca de clube degrada graciosamente sem ela (spec `team-search`), então
 * a ausência não pode derrubar o app. Leitura em runtime, a cada chamada
 * (Server Action); `""` conta como ausente.
 */
export function apiFootballKey(): string | undefined {
  const valor = process.env.API_FOOTBALL_KEY
  return valor ? valor : undefined
}

/**
 * `SENTRY_AUTH_TOKEN` é segredo de BUILD (upload de source maps) — server-only,
 * NUNCA `NEXT_PUBLIC_`, fora do parse eager. Lido só no build do Vercel; ausente
 * => o `withSentryConfig` pula o upload (build não falha). Espelha
 * `apiFootballKey`: `""` conta como ausente.
 */
export function sentryAuthToken(): string | undefined {
  const valor = process.env.SENTRY_AUTH_TOKEN
  return valor ? valor : undefined
}
