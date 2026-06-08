import { describe, expect, it } from "vitest"

import { changePasswordSchema } from "@/schema/authSchema"

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
