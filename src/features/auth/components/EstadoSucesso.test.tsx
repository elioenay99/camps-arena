// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Mensagem anti-enumeração: idêntica exista ou não a conta.
const MSG_RECUPERACAO =
  "Se existir uma conta com esse e-mail, enviamos um link de recuperação."
const MSG_CADASTRO = "Conta criada. Confirme o e-mail para continuar."

vi.mock("@/actions/auth", () => ({
  signup: vi.fn(async () => ({ success: MSG_CADASTRO })),
  forgotPassword: vi.fn(async () => ({ success: MSG_RECUPERACAO })),
}))

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: { children: ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm"
import { SignupForm } from "@/features/auth/components/SignupForm"

afterEach(cleanup)

describe("estado de sucesso dos formulários de auth", () => {
  it("recuperação de senha: mensagem + ação de voltar ao login", async () => {
    render(<ForgotPasswordForm />)

    await userEvent.type(screen.getByLabelText(/e-mail/i), "alguem@exemplo.com")
    await userEvent.click(
      screen.getByRole("button", { name: /enviar link de recuperação/i }),
    )

    const status = await screen.findByRole("status")
    // O texto anti-enumeração NÃO pode mudar — a ação seguinte é idêntica nos
    // dois casos e por isso também não vaza a existência da conta.
    expect(status).toHaveTextContent(MSG_RECUPERACAO)
    // Antes, o formulário virava um parágrafo solto: sem próximo passo.
    expect(screen.getByRole("link", { name: /voltar ao login/i })).toHaveAttribute(
      "href",
      "/login",
    )
  })

  it("cadastro: confirmação + ação de ir para o login", async () => {
    render(<SignupForm />)

    await userEvent.type(screen.getByLabelText(/^nome$/i), "Fulano")
    await userEvent.click(screen.getByRole("button", { name: /criar conta/i }))

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(MSG_CADASTRO),
    )
    expect(screen.getByRole("link", { name: /ir para o login/i })).toHaveAttribute(
      "href",
      "/login",
    )
    // O formulário sai de cena: não restam campos para reenviar o cadastro.
    expect(screen.queryByLabelText(/^nome$/i)).not.toBeInTheDocument()
  })
})
