import type { Breadcrumb, Event } from "@sentry/nextjs"

/**
 * Núcleo de scrubbing de PII para o Sentry. PURO (sem IO), compartilhado pelos
 * 3 runtimes (server/edge/client) via `beforeSend` (erros) E
 * `beforeSendTransaction` (performance — transações NÃO passam pelo beforeSend,
 * então precisam do seu próprio gancho). É a 3ª camada de defesa (as outras:
 * `sendDefaultPii:false` e `requestDataIntegration include:false`).
 *
 * Redige e-mail, telefone BR e `wa.me` de TODA string que possa sobrar:
 * message, transaction, exception.value, request.*, tags, extra, contexts,
 * breadcrumbs e spans (de transações).
 *
 * Formato do domínio (authSchema `celularBR` + `linkWhatsApp`): celular = 11
 * dígitos (`DDD`+`9`+8); link = `wa.me/55`+11 = 13 dígitos. A regex casa os 3
 * formatos reais (`11912345678`, `5511912345678`, `(11) 91234-5678`); o `9` do
 * 3º dígito ancora e evita casar timestamps de 13 dígitos.
 */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const TELEFONE_BR = /(?:\+?55[\s-]?)?\(?[1-9]{2}\)?[\s-]?9\d{4}[\s-]?\d{4}/g
const WA_ME = /wa\.me\/\d+/g
const REDACTED = "[REDACTED]"
const MAX_DEPTH = 8

function scrubString(s: string): string {
  return s
    .replace(WA_ME, "wa.me/[REDACTED]")
    .replace(EMAIL, REDACTED)
    .replace(TELEFONE_BR, REDACTED)
}

/**
 * Redige strings recursivamente, MUTANDO in-place (eventos Sentry são
 * descartáveis). Guarda contra ciclos (`WeakSet`) e profundidade — sem isso um
 * objeto cíclico em `contexts`/`extra` faria o gancho entrar em loop e o SDK
 * descartaria o evento em silêncio.
 */
function scrubDeep(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === "string") return scrubString(value)
  if (depth >= MAX_DEPTH) return value
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, seen, depth + 1))
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return value
    seen.add(value)
    const obj = value as Record<string, unknown>
    for (const k of Object.keys(obj)) {
      obj[k] = scrubDeep(obj[k], seen, depth + 1)
    }
    return value
  }
  return value
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message)
  if (breadcrumb.data) {
    breadcrumb.data = scrubDeep(breadcrumb.data, new WeakSet(), 0) as Breadcrumb["data"]
  }
  return breadcrumb
}

/**
 * Redige todos os campos comuns a eventos de erro E de transação. Genérico
 * sobre o tipo de Event para servir aos dois ganchos com paridade total.
 */
function scrubCommon<T extends Event>(event: T): T {
  const seen = new WeakSet<object>()

  // Defesa em profundidade: além do requestDataIntegration include:false, zera
  // o que possa carregar PII na request.
  if (event.request) {
    delete event.request.cookies
    delete event.request.headers
    delete event.request.data
    if (event.request.query_string) event.request.query_string = REDACTED
    if (event.request.url) event.request.url = scrubString(event.request.url)
  }

  // Identidade: só o UUID opaco do Supabase — nunca email/nome/celular.
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {}

  if (event.message) event.message = scrubString(event.message)
  // Nome da transação/handler (rota). Em App Router é parametrizada e segura,
  // mas redigir é idempotente e fecha o caso de URL com query vazando.
  if (event.transaction) event.transaction = scrubString(event.transaction)

  event.exception?.values?.forEach((ex) => {
    if (ex.value) ex.value = scrubString(ex.value)
  })

  if (event.tags) event.tags = scrubDeep(event.tags, seen, 0) as Event["tags"]
  if (event.extra) event.extra = scrubDeep(event.extra, seen, 0) as Event["extra"]
  if (event.contexts) {
    event.contexts = scrubDeep(event.contexts, seen, 0) as Event["contexts"]
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)

  // Spans de transação (descrição de query/HTTP pode carregar dado): só existem
  // em eventos de transação — acesso defensivo via cast.
  const spans = (event as { spans?: unknown }).spans
  if (Array.isArray(spans)) {
    for (const span of spans as Array<{ description?: string; data?: unknown }>) {
      if (span.description) span.description = scrubString(span.description)
      if (span.data) span.data = scrubDeep(span.data, seen, 0) as typeof span.data
    }
  }

  return event
}

/**
 * Gancho `beforeSend` (eventos de erro) E `beforeSendTransaction` (performance).
 * Genérico sobre `Event`: a mesma função instancia para `ErrorEvent` ou para o
 * evento de transação conforme o gancho — paridade total de scrubbing sem
 * depender do nome `TransactionEvent` (não reexportado pelo @sentry/nextjs).
 */
export function scrubEvent<T extends Event>(event: T): T {
  return scrubCommon(event)
}

/** Alias semântico para o gancho `beforeSendTransaction` (mesmo scrub genérico). */
export const scrubTransactionEvent = scrubEvent
