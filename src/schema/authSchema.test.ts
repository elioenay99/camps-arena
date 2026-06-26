import { describe, expect, it } from "vitest"

import { changePasswordSchema, profileSchema } from "@/schema/authSchema"

/** Erros achatados por campo (mesma forma usada pelas actions). */
function fieldErrors(input: unknown) {
  const r = changePasswordSchema.safeParse(input)
  if (r.success) return null
  const flat: Record<string, string[]> = {}
  for (const issue of r.error.issues) {
    const key = String(issue.path[0] ?? "_")
    ;(flat[key] ??= []).push(issue.message)
  }
  return flat
}

describe("changePasswordSchema", () => {
  it("aceita atual + nova (≥6) coincidindo e diferente da atual", () => {
    const r = changePasswordSchema.safeParse({
      senhaAtual: "atual123",
      novaSenha: "novaSegura",
      confirmar: "novaSegura",
    })
    expect(r.success).toBe(true)
  })

  it("rejeita nova senha curta (< 6) no campo novaSenha", () => {
    expect(
      fieldErrors({ senhaAtual: "atual123", novaSenha: "123", confirmar: "123" })
    ).toMatchObject({ novaSenha: [expect.stringMatching(/ao menos 6/i)] })
  })

  it("rejeita confirmação divergente no campo confirmar", () => {
    expect(
      fieldErrors({
        senhaAtual: "atual123",
        novaSenha: "novaSegura",
        confirmar: "outra",
      })
    ).toMatchObject({ confirmar: [expect.stringMatching(/não coincidem/i)] })
  })

  it("rejeita nova senha IGUAL à atual no campo novaSenha", () => {
    expect(
      fieldErrors({
        senhaAtual: "mesma123",
        novaSenha: "mesma123",
        confirmar: "mesma123",
      })
    ).toMatchObject({ novaSenha: [expect.stringMatching(/diferente da atual/i)] })
  })

  it("rejeita senha atual vazia no campo senhaAtual", () => {
    expect(
      fieldErrors({ senhaAtual: "", novaSenha: "novaSegura", confirmar: "novaSegura" })
    ).toMatchObject({ senhaAtual: [expect.stringMatching(/senha atual/i)] })
  })
})

describe("profileSchema", () => {
  it("aceita nome (≥2) e celular BR (nacional → normaliza para E.164 +55)", () => {
    const r = profileSchema.safeParse({
      nome: "  Ana Souza ",
      celular: "(11) 91234-5678",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nome).toBe("Ana Souza")
      expect(r.data.celular).toBe("+5511912345678")
    }
  })

  it("aceita E.164 internacional e preserva o DDI (Portugal, EUA)", () => {
    const pt = profileSchema.safeParse({ nome: "João", celular: "+351931482194" })
    expect(pt.success).toBe(true)
    if (pt.success) expect(pt.data.celular).toBe("+351931482194")

    // Aceita com máscara/espacos do país também (normaliza para E.164 canônico).
    const us = profileSchema.safeParse({ nome: "Sam", celular: "+1 415 555 2671" })
    expect(us.success).toBe(true)
    if (us.success) expect(us.data.celular).toBe("+14155552671")
  })

  it("legado BR já em E.164 permanece idêntico (idempotente)", () => {
    const r = profileSchema.safeParse({ nome: "Ana", celular: "+5511912345678" })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.celular).toBe("+5511912345678")
  })

  it("aceita fixo BR de 10 dígitos — decisão de escopo (sem distinção móvel×fixo)", () => {
    // A metadata 'min' do libphonenumber valida o plano de numeração, não móvel×fixo;
    // o campo alimenta um wa.me, e a checagem estrita está fora de escopo do design.
    const r = profileSchema.safeParse({ nome: "Ana", celular: "1133334444" })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.celular).toBe("+551133334444")
  })

  it("rejeita nome curto (< 2) no campo nome", () => {
    const r = profileSchema.safeParse({ nome: "A", celular: "11912345678" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("nome")
    }
  })

  it("rejeita celular inválido (curto demais) no campo celular", () => {
    const r = profileSchema.safeParse({ nome: "Ana", celular: "123" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("celular")
    }
  })

  it("rejeita E.164 com DDI inexistente", () => {
    const r = profileSchema.safeParse({ nome: "Ana", celular: "+9999999999" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("celular")
    }
  })
})
