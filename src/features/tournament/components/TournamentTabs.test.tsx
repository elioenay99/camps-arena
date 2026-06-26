// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"

import {
  TournamentTabs,
  type AbaTorneio,
} from "@/features/tournament/components/TournamentTabs"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

function abas(extra: AbaTorneio[] = []): AbaTorneio[] {
  return [
    {
      value: "classificacao",
      label: "Classificação",
      icon: <span />,
      content: <div>conteudo-classificacao</div>,
    },
    { value: "vagas", label: "Vagas", icon: <span />, content: <div>conteudo-vagas</div> },
    ...extra,
  ]
}

describe("TournamentTabs", () => {
  it("renderiza uma aba por item e ativa o padrão", () => {
    render(<TournamentTabs abas={abas()} padrao="classificacao" />)
    expect(screen.getAllByRole("tab")).toHaveLength(2)
    expect(screen.getByRole("tab", { name: "Classificação" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByText("conteudo-classificacao")).toBeVisible()
  })

  it("troca de aba ao clicar", async () => {
    render(<TournamentTabs abas={abas()} padrao="classificacao" />)
    await userEvent.click(screen.getByRole("tab", { name: "Vagas" }))
    expect(screen.getByRole("tab", { name: "Vagas" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByText("conteudo-vagas")).toBeVisible()
  })

  it("badge aparece quando informado", () => {
    const comBadge = abas([
      { value: "partidas", label: "Partidas", icon: <span />, content: <div />, badge: 3 },
    ])
    render(<TournamentTabs abas={comBadge} padrao="classificacao" />)
    expect(screen.getByRole("tab", { name: /Partidas/ })).toHaveTextContent("3")
  })

  it("clamp: aba ativa que some cai para o padrão (sem painel-fantasma)", async () => {
    const comRodadas = abas([
      {
        value: "rodadas",
        label: "Rodadas",
        icon: <span />,
        content: <div>conteudo-rodadas</div>,
      },
    ])
    const { rerender } = render(
      <TournamentTabs abas={comRodadas} padrao="classificacao" />
    )
    await userEvent.click(screen.getByRole("tab", { name: "Rodadas" }))
    expect(screen.getByRole("tab", { name: "Rodadas" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    // A aba Rodadas deixa de existir (ex.: liberou a última rodada).
    rerender(<TournamentTabs abas={abas()} padrao="classificacao" />)
    expect(screen.queryByRole("tab", { name: "Rodadas" })).toBeNull()
    expect(screen.getByRole("tab", { name: "Classificação" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("deep-link por hash ativa a aba correspondente no mount", () => {
    window.location.hash = "#vagas"
    render(<TournamentTabs abas={abas()} padrao="classificacao" />)
    expect(screen.getByRole("tab", { name: "Vagas" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })
})
