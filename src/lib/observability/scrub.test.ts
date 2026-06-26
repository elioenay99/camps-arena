import type { ErrorEvent, Event } from "@sentry/nextjs"
import { describe, expect, it } from "vitest"

import {
  scrubBreadcrumb,
  scrubEvent,
  scrubTransactionEvent,
} from "@/lib/observability/scrub"

// Os 3 formatos reais que circulam no app (iguais a whatsapp.test.ts).
const CELULARES = ["11912345678", "5511912345678", "(11) 91234-5678"]
// Trecho distintivo do número que NÃO pode sobrar em nenhum formato.
const NUCLEO = "912345678"
// E-mails reais que podem vazar em logs/payloads.
const EMAILS = ["fulano@exemplo.com", "ataias.clash+tag@gmail.com", "a@b.co"]

function semVazamento(s: string | undefined) {
  expect(s ?? "").not.toContain(NUCLEO)
  expect(s ?? "").not.toContain("91234-5678")
}

function semEmail(s: string | undefined) {
  expect(s ?? "").not.toMatch(/@/)
}

describe("scrubEvent — redação de PII", () => {
  it("redige o celular (3 formatos) em event.message", () => {
    for (const cel of CELULARES) {
      const out = scrubEvent({ message: `Falha ao salvar ${cel} no perfil` } as ErrorEvent)
      semVazamento(out.message)
      expect(out.message).toContain("[REDACTED]")
    }
  })

  it("redige e-mail em event.message (e telefone/wa.me seguem redigidos)", () => {
    for (const email of EMAILS) {
      const out = scrubEvent({
        message: `Falha do contato ${email} ao ligar 11912345678 via wa.me/5511912345678`,
      } as ErrorEvent)
      semEmail(out.message)
      semVazamento(out.message)
      expect(out.message).not.toContain("wa.me/5511912345678")
      expect(out.message).toContain("[REDACTED]")
    }
  })

  it("redige e-mail em event.extra aninhado (sem afetar valores neutros)", () => {
    const out = scrubEvent({
      extra: { form: { nested: ["ok", "avisar fulano@exemplo.com e 5511912345678"] } },
      contexts: { perfil: { email: "ataias.clash+tag@gmail.com", celular: "11912345678" } },
    } as unknown as ErrorEvent)
    const blob = JSON.stringify({ extra: out.extra, contexts: out.contexts })
    semEmail(blob)
    semVazamento(blob)
    expect(blob).toContain("ok")
  })

  it("redige celular internacional em E.164 (Portugal, EUA, França)", () => {
    const E164 = ["+351931482194", "+14155552671", "+33612345678"]
    for (const num of E164) {
      const out = scrubEvent({ message: `Falha ao contatar ${num} no perfil` } as ErrorEvent)
      expect(out.message).not.toContain(num)
      expect(out.message).not.toContain(num.slice(1)) // nem os dígitos sem o +
      expect(out.message).toContain("[REDACTED]")
    }
    // Aninhado em extra/contexts também é redigido.
    const out = scrubEvent({
      extra: { tel: "+351931482194" },
      contexts: { perfil: { celular: "+14155552671" } },
    } as unknown as ErrorEvent)
    const blob = JSON.stringify({ extra: out.extra, contexts: out.contexts })
    expect(blob).not.toContain("351931482194")
    expect(blob).not.toContain("14155552671")
  })

  it("redige o celular em exception.values[].value", () => {
    const out = scrubEvent({
      exception: { values: [{ type: "Error", value: "celular 11912345678 inválido" }] },
    } as ErrorEvent)
    semVazamento(out.exception?.values?.[0]?.value)
  })

  it("redige wa.me/<numero> e remove dados sensíveis da request", () => {
    const out = scrubEvent({
      request: {
        url: "https://arena.app/x?to=https://wa.me/5511912345678",
        query_string: "celular=11912345678",
        cookies: { sb: "tok" },
        headers: { authorization: "Bearer x" },
        data: { celular: "11912345678" },
      },
    } as unknown as ErrorEvent)
    expect(out.request?.cookies).toBeUndefined()
    expect(out.request?.headers).toBeUndefined()
    expect(out.request?.data).toBeUndefined()
    expect(out.request?.query_string).toBe("[REDACTED]")
    expect(out.request?.url).toContain("wa.me/[REDACTED]")
    semVazamento(out.request?.url as string)
  })

  it("redige em extra e contexts aninhados", () => {
    const out = scrubEvent({
      extra: { form: { nested: ["ok", "ligar para 5511912345678"] } },
      contexts: { perfil: { celular: "11912345678" } },
    } as unknown as ErrorEvent)
    const blob = JSON.stringify({ extra: out.extra, contexts: out.contexts })
    semVazamento(blob)
  })

  it("reduz event.user ao id opaco (descarta email/nome/celular)", () => {
    const out = scrubEvent({
      user: { id: "uuid-123", email: "a@b.com", username: "fulano", celular: "11912345678" },
    } as unknown as ErrorEvent)
    expect(out.user).toEqual({ id: "uuid-123" })
  })

  it("não trava com objeto cíclico em extra", () => {
    const ciclico: Record<string, unknown> = { msg: "ligar 11912345678" }
    ciclico.self = ciclico
    const out = scrubEvent({ extra: { ciclico } } as unknown as ErrorEvent)
    semVazamento(JSON.stringify(out.extra, () => undefined))
    // chegou aqui sem estourar a pilha
    expect(out).toBeDefined()
  })

  it("redige o celular em event.tags e event.transaction", () => {
    const out = scrubEvent({
      transaction: "POST /x?to=wa.me/5511912345678",
      tags: { contato: "11912345678", rota: "/dashboard" },
    } as unknown as ErrorEvent)
    semVazamento(out.transaction)
    semVazamento(JSON.stringify(out.tags))
    expect(out.tags?.rota).toBe("/dashboard")
  })

  it("não redige excessivamente um número curto não-telefônico", () => {
    const out = scrubEvent({ message: "pedido 12345 na linha 42" } as ErrorEvent)
    expect(out.message).toContain("12345")
    expect(out.message).toContain("42")
  })

  it("redige um celular válido alternativo (13 díg) e NÃO casa DDD inválido", () => {
    // 5511912345679: formato BR válido (13 díg) → redigir.
    const valido = scrubEvent({ message: "num 5511912345679" } as ErrorEvent)
    expect(valido.message).not.toContain("5511912345679")
    // 550123456789: DDD "01" inválido (não [1-9]{2}) → preservar (sem over-redaction).
    const naoFone = scrubEvent({ message: "id 550123456789 ok" } as ErrorEvent)
    expect(naoFone.message).toContain("550123456789")
  })
})

describe("scrubTransactionEvent — eventos de performance", () => {
  it("redige transaction, spans (description/data) e tags", () => {
    const out = scrubTransactionEvent({
      type: "transaction",
      transaction: "GET /perfil",
      tags: { tel: "5511912345678" },
      spans: [
        { description: "db: select where celular=11912345678", data: { q: "wa.me/5511912345678" } },
      ],
    } as unknown as Event)
    semVazamento(out.transaction)
    semVazamento(JSON.stringify(out.tags))
    const spans = (out as unknown as { spans?: Array<{ description?: string; data?: unknown }> }).spans
    semVazamento(spans?.[0]?.description)
    semVazamento(JSON.stringify(spans?.[0]?.data))
  })
})

describe("scrubBreadcrumb", () => {
  it("redige message e data do breadcrumb", () => {
    const out = scrubBreadcrumb({
      message: "click em wa.me/5511912345678",
      data: { href: "https://wa.me/5511912345678", nome: "ok" },
    })
    semVazamento(out.message)
    semVazamento(JSON.stringify(out.data))
    expect(out.data?.nome).toBe("ok")
  })

  it("redige e-mail em message e data do breadcrumb (telefone/wa.me seguem)", () => {
    const out = scrubBreadcrumb({
      message: "login de fulano@exemplo.com via wa.me/5511912345678",
      data: { email: "ataias.clash+tag@gmail.com", celular: "11912345678", nome: "ok" },
    })
    semEmail(out.message)
    semVazamento(out.message)
    expect(out.message).not.toContain("wa.me/5511912345678")
    semEmail(JSON.stringify(out.data))
    semVazamento(JSON.stringify(out.data))
    expect(out.data?.nome).toBe("ok")
  })
})
