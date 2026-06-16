// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ColorField } from "@/components/ui/color-field"

afterEach(cleanup)

// A11y do campo de cor (WCAG 1.3.1/3.3.1): a mensagem de hex inválido precisa
// estar associada ao input (aria-describedby) e ser anunciada (role=alert).
describe("ColorField — associação do erro de validação", () => {
  it("hex inválido: input ganha aria-invalid e aria-describedby apontando o erro", () => {
    render(
      <ColorField label="Cor primária" value="#zzz" onChange={vi.fn()} />
    )

    const input = screen.getByRole("textbox", { name: "Cor primária" })
    const alerta = screen.getByRole("alert")

    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(alerta).toHaveTextContent("Use uma cor no formato #rrggbb.")
    expect(input.getAttribute("aria-describedby")).toContain(alerta.id)
  })

  it("erro + descrição: aria-describedby referencia ambos", () => {
    render(
      <ColorField
        label="Cor secundária"
        value="#xyz"
        onChange={vi.fn()}
        description="Deixe vazio para usar o tema do app."
      />
    )

    const input = screen.getByRole("textbox", { name: "Cor secundária" })
    const alerta = screen.getByRole("alert")
    const descricao = screen.getByText("Deixe vazio para usar o tema do app.")
    const referenciados = input.getAttribute("aria-describedby")?.split(" ")

    expect(referenciados).toEqual(
      expect.arrayContaining([alerta.id, descricao.id])
    )
  })

  it("hex válido: sem alerta, sem aria-invalid e sem describedby pendurado", () => {
    render(
      <ColorField label="Cor primária" value="#aabbcc" onChange={vi.fn()} />
    )

    const input = screen.getByRole("textbox", { name: "Cor primária" })

    expect(screen.queryByRole("alert")).toBeNull()
    expect(input).toHaveAttribute("aria-invalid", "false")
    expect(input).not.toHaveAttribute("aria-describedby")
  })

  it("valor vazio é válido (sem cor): não dispara o erro", () => {
    render(<ColorField label="Cor primária" value="" onChange={vi.fn()} />)

    expect(screen.queryByRole("alert")).toBeNull()
    expect(
      screen.getByRole("textbox", { name: "Cor primária" })
    ).toHaveAttribute("aria-invalid", "false")
  })

  it("corrigir o hex limpa o aria-describedby de erro", () => {
    const { rerender } = render(
      <ColorField label="Cor primária" value="#zz" onChange={vi.fn()} />
    )
    const input = screen.getByRole("textbox", { name: "Cor primária" })
    expect(input.getAttribute("aria-describedby")).toContain(`-erro`)

    rerender(
      <ColorField label="Cor primária" value="#112233" onChange={vi.fn()} />
    )
    expect(input).not.toHaveAttribute("aria-describedby")
  })

  it("digitar propaga o valor cru para onChange", () => {
    const onChange = vi.fn()
    render(<ColorField label="Cor primária" value="" onChange={onChange} />)

    fireEvent.change(screen.getByRole("textbox", { name: "Cor primária" }), {
      target: { value: "#ABCDEF" },
    })
    expect(onChange).toHaveBeenCalledWith("#ABCDEF")
  })
})
