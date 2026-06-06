// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// As listas embutem o botão de lifecycle (client) — neutralizado no render.
vi.mock("@/actions/match", () => ({
  encerrarPartida: vi.fn(),
  reabrirPartida: vi.fn(),
}))

import { MatchHistoryList } from "@/features/match/components/MatchHistoryList"
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList"

afterEach(cleanup)

describe("rótulo de rodada nas listas de partidas", () => {
  it("OpenMatchesList mostra a rodada quando presente e omite quando nula", () => {
    render(
      <OpenMatchesList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 2,
            perna: null,
          },
          {
            id: "m2",
            nome_1: "Caio",
            nome_2: "Dani",
            placar_1: 1,
            placar_2: 1,
            status: "em_andamento",
            rodada: null,
            perna: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R2")).toBeInTheDocument()
    // Partida avulsa (rodada null) renderiza sem rótulo — como sempre.
    expect(screen.queryByText(/^R\d+$/u)?.textContent).toBe("R2")
    // E o texto acessível identifica a rodada.
    expect(screen.getByText(/Rodada 2: Placar atual/)).toBeInTheDocument()
  })

  it("OpenMatchesList identifica a perna do confronto ida-e-volta", () => {
    render(
      <OpenMatchesList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 1,
            perna: 1,
          },
          {
            id: "m2",
            nome_1: "Beto",
            nome_2: "Ana",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 1,
            perna: 2,
          },
        ]}
      />
    )
    expect(screen.getByText("R1 ida")).toBeInTheDocument()
    expect(screen.getByText("R1 volta")).toBeInTheDocument()
    expect(screen.getByText(/Rodada 1 \(volta\): Placar atual/)).toBeInTheDocument()
  })

  it("MatchHistoryList mostra a rodada da encerrada quando presente", () => {
    render(
      <MatchHistoryList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 2,
            placar_2: 1,
            encerradaEm: "2026-06-04T12:00:00Z",
            rodada: 5,
            perna: null,
          },
          {
            id: "m2",
            nome_1: "Caio",
            nome_2: "Dani",
            placar_1: 0,
            placar_2: 3,
            encerradaEm: "2026-06-03T12:00:00Z",
            rodada: null,
            perna: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R5")).toBeInTheDocument()
    expect(screen.getByText(/Rodada 5: Placar final/)).toBeInTheDocument()
    // A avulsa segue sem rótulo.
    expect(screen.queryByText("R0")).toBeNull()
    expect(screen.getAllByText(/^R\d+$/u)).toHaveLength(1)
  })
})
