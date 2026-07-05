// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Termo } from "@/features/glossario/Termo"
import { TERMOS } from "@/features/glossario/termos"

afterEach(cleanup)

// jsdom: usar fireEvent.click (não userEvent — valida pointer-events/posição que
// o Popper não resolve em jsdom); o PopoverContent NÃO tem seta (ResizeObserver
// ausente quebraria). Asserções só de presença/atributos, nunca coordenadas.
describe("Termo — ajuda contextual acessível", () => {
  it("renderiza o gatilho '?' com aria-label do termo e aria-haspopup", () => {
    render(<Termo id="promedio">Promédio</Termo>)
    const gatilho = screen.getByRole("button", { name: "O que é Promédio?" })
    expect(gatilho).toBeInTheDocument()
    // Radix emite aria-haspopup="dialog" — assertar por PRESENÇA do atributo.
    expect(gatilho).toHaveAttribute("aria-haspopup")
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
  })

  it("abre por clique e mostra a explicação; fecha por Esc", () => {
    render(<Termo id="promedio">Promédio</Termo>)
    const gatilho = screen.getByRole("button", { name: "O que é Promédio?" })

    // Fechado: a explicação não está no DOM.
    expect(screen.queryByText(TERMOS.promedio.explicacao)).toBeNull()

    fireEvent.click(gatilho)
    expect(gatilho).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(TERMOS.promedio.explicacao)).toBeInTheDocument()

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    })
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
  })

  it("a explicação de 'promedio' é POR JOGO (não por temporada)", () => {
    expect(TERMOS.promedio.explicacao).toContain("por jogo")
    expect(TERMOS.promedio.explicacao).not.toContain("por temporada")
  })
})
