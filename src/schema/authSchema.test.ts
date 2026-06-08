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
  it("aceita nome (≥2) e celular brasileiro (normaliza para dígitos)", () => {
    const r = profileSchema.safeParse({
      nome: "  Ana Souza ",
      celular: "(11) 91234-5678",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.nome).toBe("Ana Souza")
      expect(r.data.celular).toBe("11912345678")
    }
  })

  it("rejeita nome curto (< 2) no campo nome", () => {
    const r = profileSchema.safeParse({ nome: "A", celular: "11912345678" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("nome")
    }
  })

  it("rejeita celular fora do formato no campo celular", () => {
    const r = profileSchema.safeParse({ nome: "Ana", celular: "123" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0]?.path[0]).toBe("celular")
    }
  })
})
