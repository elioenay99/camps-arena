// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/image → <img> simples (sem o otimizador), p/ assertir o src do escudo.
vi.mock("next/image", () => ({
  default: (props: { src: unknown; alt?: string; onError?: () => void }) => {
    const src = typeof props.src === "string" ? props.src : ""
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={props.alt ?? ""} onError={props.onError} />
  },
}))

import { MuralhaRanking } from "@/features/league/components/MuralhaRanking"
import type { LinhaMuralha } from "@/features/league/data/getMuralha"

afterEach(cleanup)

const linha = (over: Partial<LinhaMuralha>): LinhaMuralha => ({
  competitorId: "c1",
  competitorNome: "Ataias",
  escudoUrl: null,
  jogos: 5,
  cleanSheets: 3,
  golsSofridos: 2,
  ...over,
})

describe("MuralhaRanking", () => {
  it("vazio: mostra o estado limpo, sem lista", () => {
    render(<MuralhaRanking linhas={[]} />)
    expect(screen.getByText(/Nenhuma defesa registrada ainda/)).toBeInTheDocument()
    expect(screen.queryByRole("list")).toBeNull()
  })

  it("lista os competidores na ORDEM recebida (já ordenada por clean sheets)", () => {
    render(
      <MuralhaRanking
        linhas={[
          linha({ competitorId: "c1", competitorNome: "Ataias", cleanSheets: 5 }),
          linha({ competitorId: "c2", competitorNome: "João", cleanSheets: 3 }),
        ]}
      />
    )
    const itens = screen.getAllByRole("listitem")
    expect(itens).toHaveLength(2)
    // Preserva a ordem do backend (não reordena).
    expect(itens[0]).toHaveTextContent("Ataias")
    expect(itens[0]).toHaveTextContent("5")
    expect(itens[1]).toHaveTextContent("João")
  })

  it("mostra gols sofridos e jogos, e linka para a página do competidor", () => {
    render(
      <MuralhaRanking
        linhas={[
          linha({ competitorId: "c9", competitorNome: "Ataias", golsSofridos: 2, jogos: 5 }),
        ]}
      />
    )
    expect(screen.getByText(/2 gols sofridos em 5 jogos/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ataias" })).toHaveAttribute(
      "href",
      "/dashboard/ligas/competidor/c9"
    )
  })

  it("singulariza gol sofrido e jogo", () => {
    render(
      <MuralhaRanking
        linhas={[linha({ golsSofridos: 1, jogos: 1, cleanSheets: 1 })]}
      />
    )
    expect(screen.getByText(/1 gol sofrido em 1 jogo/)).toBeInTheDocument()
    expect(screen.getByText("clean sheet")).toBeInTheDocument()
  })

  it("mostra o escudo real quando a linha tem escudoUrl", () => {
    const url = "https://x/joao.png"
    const { container } = render(
      <MuralhaRanking linhas={[linha({ escudoUrl: url })]} />
    )
    expect(container.querySelector("img")).toHaveAttribute("src", url)
  })

  it("cai no monograma quando escudoUrl é null (competidor por-nome/avulso)", () => {
    const { container } = render(
      <MuralhaRanking
        linhas={[linha({ competitorNome: "Ataias", escudoUrl: null })]}
      />
    )
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("A")).toBeInTheDocument()
  })
})
