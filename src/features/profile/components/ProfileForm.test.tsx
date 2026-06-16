// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { AuthState } from "@/actions/auth"

// A action é mockada p/ devolver um estado de erro por campo determinístico —
// o alvo é a A11Y do markup (associação + anúncio), não a validação real.
const atualizarPerfil = vi.fn<
  (state: AuthState, formData: FormData) => Promise<AuthState>
>()
vi.mock("@/actions/profile", () => ({
  atualizarPerfil: (state: AuthState, formData: FormData) =>
    atualizarPerfil(state, formData),
}))

import { ProfileForm } from "@/features/profile/components/ProfileForm"

afterEach(() => {
  cleanup()
  atualizarPerfil.mockReset()
})

// Representa o padrão COMPARTILHADO por todos os forms de Server Action (auth +
// profile): erro por campo com id estável, aria-describedby condicional no input
// e role=alert no parágrafo. Validar aqui cobre a fiação dos demais.
describe("ProfileForm — A11y do erro por campo (WCAG 1.3.1/3.3.1)", () => {
  it("sem erro: inputs não carregam aria-describedby pendurado", () => {
    render(<ProfileForm nome="Ana" celular="11999999999" />)

    expect(screen.getByLabelText("Nome")).not.toHaveAttribute(
      "aria-describedby"
    )
    expect(screen.getByLabelText("Celular")).not.toHaveAttribute(
      "aria-describedby"
    )
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("com erro: input aponta aria-describedby p/ um alerta com a mensagem", async () => {
    atualizarPerfil.mockResolvedValue({
      fieldErrors: {
        nome: ["Informe seu nome."],
        celular: ["Celular inválido."],
      },
    })

    render(<ProfileForm nome="" celular="" />)
    screen.getByRole("button", { name: /salvar perfil/i }).click()

    await waitFor(() => {
      expect(screen.getByText("Informe seu nome.")).toBeInTheDocument()
    })

    const nome = screen.getByLabelText("Nome")
    const celular = screen.getByLabelText("Celular")
    const alertas = screen.getAllByRole("alert")

    expect(nome).toHaveAttribute("aria-invalid", "true")
    expect(nome).toHaveAttribute("aria-describedby", "nome-erro")
    expect(document.getElementById("nome-erro")).toHaveTextContent(
      "Informe seu nome."
    )

    expect(celular).toHaveAttribute("aria-invalid", "true")
    expect(celular).toHaveAttribute("aria-describedby", "celular-erro")
    expect(document.getElementById("celular-erro")).toHaveTextContent(
      "Celular inválido."
    )

    // Ambas as mensagens são anunciadas (role=alert).
    expect(alertas).toHaveLength(2)
  })
})
