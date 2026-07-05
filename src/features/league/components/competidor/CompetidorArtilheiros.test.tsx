// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CompetidorArtilheiros } from "@/features/league/components/competidor/CompetidorArtilheiros"

afterEach(cleanup)

describe("CompetidorArtilheiros", () => {
  it("vazio: mostra o estado limpo, sem lista", () => {
    render(<CompetidorArtilheiros artilheiros={[]} />)
    expect(screen.getByText(/Nenhum gol registrado ainda/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("lista os artilheiros com nome e gols, na ordem recebida", () => {
    render(
      <CompetidorArtilheiros
        artilheiros={[
          { jogador: "Endrick", gols: 7 },
          { jogador: "Vini", gols: 1 },
        ]}
      />
    )
    const itens = screen.getAllByRole("listitem")
    expect(itens).toHaveLength(2)
    expect(itens[0]).toHaveTextContent("Endrick")
    expect(itens[0]).toHaveTextContent("7")
    expect(itens[0]).toHaveTextContent("gols")
    // Singular no autor de 1 gol.
    expect(itens[1]).toHaveTextContent("Vini")
    expect(itens[1]).toHaveTextContent("gol")
  })
})
