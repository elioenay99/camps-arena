// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { RankingExpansivel } from "@/features/league/components/RankingExpansivel"

afterEach(cleanup)

const itens = (n: number) =>
  Array.from({ length: n }, (_, i) => <li key={i}>Colocado {i + 1}</li>)

describe("RankingExpansivel", () => {
  it("com >10, mostra só os 10 primeiros e um 'Ver mais (N)' com N = restantes", () => {
    render(<RankingExpansivel>{itens(13)}</RankingExpansivel>)

    // Só os 10 primeiros na lista.
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(screen.getByText("Colocado 10")).toBeInTheDocument()
    expect(screen.queryByText("Colocado 11")).toBeNull()

    // Botão revela os 3 restantes (13 - 10).
    const botao = screen.getByRole("button", { name: "Ver mais (3)" })
    expect(botao).toHaveAttribute("aria-expanded", "false")
  })

  it("expandir revela todos e alterna para 'Ver menos'; recolher volta aos 10", () => {
    render(<RankingExpansivel>{itens(15)}</RankingExpansivel>)

    fireEvent.click(screen.getByRole("button", { name: "Ver mais (5)" }))

    expect(screen.getAllByRole("listitem")).toHaveLength(15)
    expect(screen.getByText("Colocado 15")).toBeInTheDocument()
    const botao = screen.getByRole("button", { name: "Ver menos" })
    expect(botao).toHaveAttribute("aria-expanded", "true")

    // Recolhe de volta.
    fireEvent.click(botao)
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(screen.getByRole("button", { name: "Ver mais (5)" })).toBeInTheDocument()
  })

  it("aria-controls do botão aponta para o id do <ol>", () => {
    render(<RankingExpansivel>{itens(12)}</RankingExpansivel>)
    const lista = screen.getByRole("list")
    const botao = screen.getByRole("button", { name: /Ver mais/ })
    expect(botao).toHaveAttribute("aria-controls", lista.id)
    expect(lista.id).toBeTruthy()
  })

  it("com exatamente 10, mostra todos e NÃO renderiza o botão", () => {
    render(<RankingExpansivel>{itens(10)}</RankingExpansivel>)
    expect(screen.getAllByRole("listitem")).toHaveLength(10)
    expect(screen.queryByRole("button", { name: /Ver mais/ })).toBeNull()
  })

  it("com menos de 10, mostra todos e sem botão", () => {
    render(<RankingExpansivel>{itens(4)}</RankingExpansivel>)
    expect(screen.getAllByRole("listitem")).toHaveLength(4)
    expect(screen.queryByRole("button")).toBeNull()
  })
})
