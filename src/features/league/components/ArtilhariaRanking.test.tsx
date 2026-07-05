// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ArtilhariaRanking } from "@/features/league/components/ArtilhariaRanking"
import type { ArtilhariaLinha } from "@/features/league/data/getArtilharia"

afterEach(cleanup)

const linha = (over: Partial<ArtilhariaLinha>): ArtilhariaLinha => ({
  competitorId: "c1",
  competitorNome: "Ataias",
  jogador: "Endrick",
  gols: 1,
  ...over,
})

describe("ArtilhariaRanking", () => {
  it("vazio: mostra o estado limpo, sem lista", () => {
    render(<ArtilhariaRanking linhas={[]} />)
    expect(screen.getByText(/Nenhum gol registrado ainda/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("lista os artilheiros na ORDEM recebida (já ordenada por gols)", () => {
    render(
      <ArtilhariaRanking
        linhas={[
          linha({ jogador: "Vini", gols: 5 }),
          linha({ jogador: "Endrick", gols: 3 }),
        ]}
      />
    )
    const itens = screen.getAllByRole("listitem")
    expect(itens).toHaveLength(2)
    // Preserva a ordem do backend (não reordena).
    expect(itens[0]).toHaveTextContent("Vini")
    expect(itens[0]).toHaveTextContent("5")
    expect(itens[1]).toHaveTextContent("Endrick")
  })

  it("mesmo nome sob competidores diferentes vira DUAS linhas distintas", () => {
    render(
      <ArtilhariaRanking
        linhas={[
          linha({ competitorId: "c1", competitorNome: "Ataias", gols: 4 }),
          linha({ competitorId: "c2", competitorNome: "João", gols: 2 }),
        ]}
      />
    )
    expect(screen.getAllByText("Endrick")).toHaveLength(2)
    // Cada linha linka para o SEU competidor.
    expect(screen.getByRole("link", { name: "Ataias" })).toHaveAttribute(
      "href",
      "/dashboard/ligas/competidor/c1"
    )
    expect(screen.getByRole("link", { name: "João" })).toHaveAttribute(
      "href",
      "/dashboard/ligas/competidor/c2"
    )
  })
})
