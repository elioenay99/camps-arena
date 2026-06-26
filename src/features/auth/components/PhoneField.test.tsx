// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { PhoneField } from "@/features/auth/components/PhoneField"

afterEach(cleanup)

/** O valor submetido é o input OCULTO; o visível (número) não tem `name`. */
function valorOculto(container: HTMLElement): string {
  const el = container.querySelector('input[name="celular"]') as HTMLInputElement | null
  return el?.value ?? ""
}

describe("PhoneField — composição do E.164", () => {
  it("padrão Brasil: digitar compõe +55<numero> no input oculto", () => {
    const { container } = render(<PhoneField name="celular" />)
    expect(valorOculto(container)).toBe("")
    // país padrão = Brasil (+55)
    expect(screen.getByRole("button", { name: /Brasil/i })).toHaveTextContent("+55")

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "11912345678" },
    })
    expect(valorOculto(container)).toBe("+5511912345678")
  })

  it("inicializa de E.164 internacional (Portugal): DDI +351 e valor preservado", () => {
    const { container } = render(
      <PhoneField name="celular" defaultValue="+351931482194" />
    )
    expect(valorOculto(container)).toBe("+351931482194")
    expect(screen.getByRole("button", { name: /Portugal/i })).toHaveTextContent("+351")
  })

  it("inicializa de legado BR nacional de 11 dígitos → +55", () => {
    const { container } = render(
      <PhoneField name="celular" defaultValue="11912345678" />
    )
    expect(valorOculto(container)).toBe("+5511912345678")
    expect(screen.getByRole("button", { name: /Brasil/i })).toHaveTextContent("+55")
  })

  it("inicializa de legado BR de 13 dígitos (55+11) SEM duplicar o DDI", () => {
    const { container } = render(
      <PhoneField name="celular" defaultValue="5511912345678" />
    )
    expect(valorOculto(container)).toBe("+5511912345678")
  })

  it("inicializa de E.164 estrangeiro com normalização canônica (Reino Unido)", () => {
    const { container } = render(
      <PhoneField name="celular" defaultValue="+447911123456" />
    )
    expect(valorOculto(container)).toBe("+447911123456")
    // Com o Dialog fechado só existe o botão-gatilho do país; ele exibe o DDI +44.
    expect(screen.getByRole("button")).toHaveTextContent("+44")
  })

  it("trocar de país recompõe o E.164 com o novo DDI sobre o número digitado", async () => {
    const { container } = render(<PhoneField name="celular" />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "931482194" } })
    // abre o seletor e escolhe Portugal
    fireEvent.click(screen.getByRole("button", { name: /Brasil/i }))
    const portugal = await screen.findByRole("button", { name: /Portugal/i })
    fireEvent.click(portugal)
    expect(valorOculto(container)).toBe("+351931482194")
  })

  it("propaga aria-invalid e aria-describedby ao input do número", () => {
    render(
      <PhoneField name="celular" ariaInvalid ariaDescribedBy="celular-erro" />
    )
    const input = screen.getByRole("textbox")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-describedby", "celular-erro")
  })
})
