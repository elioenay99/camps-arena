// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Input } from "@/components/ui/input"
import { SelectNative } from "@/components/ui/select-native"

afterEach(cleanup)

function classes(el: Element | null) {
  return (el?.getAttribute("class") ?? "").split(/\s+/)
}

const opcoes = (
  <>
    <option value="a">A</option>
    <option value="b">B</option>
  </>
)

describe("SelectNative", () => {
  // O piso de 16px no mobile é requisito, não estética: abaixo disso o iOS
  // amplia a página ao focar o campo e NÃO desfaz o zoom ao sair.
  it("declara fonte de 16px no mobile (text-base sem prefixo)", () => {
    const { container } = render(<SelectNative aria-label="x">{opcoes}</SelectNative>)
    const cls = classes(container.querySelector("select"))
    expect(cls).toContain("text-base")
    expect(cls).not.toContain("text-sm")
  })

  it("restaura a densidade compacta do desktop (md:h-8 md:text-sm)", () => {
    const { container } = render(<SelectNative aria-label="x">{opcoes}</SelectNative>)
    const cls = classes(container.querySelector("select"))
    expect(cls).toContain("md:h-8")
    expect(cls).toContain("md:text-sm")
  })

  it("atinge o alvo de toque de 44px no mobile (h-11)", () => {
    const { container } = render(<SelectNative aria-label="x">{opcoes}</SelectNative>)
    expect(classes(container.querySelector("select"))).toContain("h-11")
  })

  // Espelhar o Input não é coincidência: um formulário que mistura os dois
  // precisa ficar alinhado sem ajuste por chamada.
  it("espelha o par mobile/desktop do Input", () => {
    const { container: s } = render(<SelectNative aria-label="x">{opcoes}</SelectNative>)
    const { container: i } = render(<Input aria-label="y" />)
    const sCls = classes(s.querySelector("select"))
    const iCls = classes(i.querySelector("input"))
    for (const c of ["h-11", "md:h-8", "text-base", "md:text-sm", "w-full", "min-w-0"]) {
      expect(sCls, `select sem ${c}`).toContain(c)
      expect(iCls, `input sem ${c}`).toContain(c)
    }
  })

  it("deixa a chamada sobrescrever a densidade de desktop sem perder o alvo mobile", () => {
    const { container } = render(
      <SelectNative aria-label="x" className="md:h-10">
        {opcoes}
      </SelectNative>
    )
    const cls = classes(container.querySelector("select"))
    expect(cls).toContain("md:h-10")
    expect(cls).not.toContain("md:h-8") // tailwind-merge resolve o conflito
    expect(cls).toContain("h-11") // o alvo de toque do mobile permanece
    expect(cls).toContain("text-base") // o piso de fonte permanece
  })

  it("repassa as props nativas do <select>", () => {
    const onChange = vi.fn()
    render(
      <SelectNative aria-label="Filtro" value="a" onChange={onChange} name="filtro">
        {opcoes}
      </SelectNative>
    )
    const el = screen.getByRole("combobox", { name: "Filtro" })
    expect(el).toHaveAttribute("name", "filtro")
    expect(el).toHaveValue("a")
    fireEvent.change(el, { target: { value: "b" } })
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it("continua sendo <select> nativo (roleta do SO no mobile, teclado de graça)", () => {
    const { container } = render(<SelectNative aria-label="x">{opcoes}</SelectNative>)
    expect(container.querySelector("select")).toBeInTheDocument()
    expect(container.querySelector("select")).toHaveAttribute("data-slot", "select-native")
  })

  it("marca o estado desabilitado", () => {
    render(
      <SelectNative aria-label="x" disabled>
        {opcoes}
      </SelectNative>
    )
    expect(screen.getByRole("combobox", { name: "x" })).toBeDisabled()
  })
})
