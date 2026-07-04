// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import { ClassificacaoResponsiva } from "@/features/standings/components/ClassificacaoResponsiva"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function grupo() {
  return document.querySelector("[data-modo]")
}

describe("ClassificacaoResponsiva", () => {
  it("começa no modo 'rolar' (determinístico p/ SSR; matchMedia ausente no jsdom)", () => {
    render(
      <ClassificacaoResponsiva>
        <span>tabela</span>
      </ClassificacaoResponsiva>
    )
    expect(grupo()).toHaveAttribute("data-modo", "rolar")
    expect(screen.getByRole("button", { name: "Rolar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Caber tudo" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  it("alterna rolar↔caber ao clicar, refletindo em data-modo e aria-pressed", async () => {
    render(
      <ClassificacaoResponsiva>
        <span>tabela</span>
      </ClassificacaoResponsiva>
    )
    await userEvent.click(screen.getByRole("button", { name: "Caber tudo" }))
    expect(grupo()).toHaveAttribute("data-modo", "caber")
    expect(screen.getByRole("button", { name: "Caber tudo" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(screen.getByRole("button", { name: "Rolar" })).toHaveAttribute(
      "aria-pressed",
      "false"
    )

    await userEvent.click(screen.getByRole("button", { name: "Rolar" }))
    expect(grupo()).toHaveAttribute("data-modo", "rolar")
  })

  it("persiste a escolha no localStorage", async () => {
    render(
      <ClassificacaoResponsiva>
        <span>tabela</span>
      </ClassificacaoResponsiva>
    )
    await userEvent.click(screen.getByRole("button", { name: "Caber tudo" }))
    expect(window.localStorage.getItem("goliseu:standings-modo")).toBe("caber")
  })
})
