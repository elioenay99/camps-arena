// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { EmptyActiveMatches } from "@/features/match/components/EmptyActiveMatches"

afterEach(cleanup)

describe("EmptyActiveMatches — 3 estados de onboarding", () => {
  it("estado 1 (sem torneios): CTA de primeiro campeonato, sem 'Nova partida'", () => {
    render(<EmptyActiveMatches semTorneios temAvulsoAberto={false} />)

    const cta = screen.getByRole("link", {
      name: /criar meu primeiro campeonato — leva 1 minuto/i,
    })
    expect(cta).toHaveAttribute("href", "/dashboard/torneios/novo")
    // Copy de boas-vindas substitui "Nenhuma partida ativa".
    expect(screen.getByText(/bem-vindo ao goliseu/i)).toBeInTheDocument()
    expect(screen.queryByText(/nenhuma partida ativa/i)).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /nova partida/i }),
    ).not.toBeInTheDocument()
  })

  it("estado 2 (com torneios, sem avulso aberto): 'Criar torneio' + 'Ver meus torneios', sem 'Nova partida'", () => {
    render(<EmptyActiveMatches semTorneios={false} temAvulsoAberto={false} />)

    expect(screen.getByText(/nenhuma partida ativa/i)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /^criar torneio$/i }),
    ).toHaveAttribute("href", "/dashboard/torneios/novo")
    expect(
      screen.getByRole("link", { name: /ver meus torneios/i }),
    ).toHaveAttribute("href", "/dashboard/torneios")
    expect(
      screen.queryByRole("link", { name: /nova partida/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/primeiro campeonato/i),
    ).not.toBeInTheDocument()
  })

  it("estado 3 (avulso aberto): 'Nova partida' + 'Criar torneio'", () => {
    render(<EmptyActiveMatches semTorneios={false} temAvulsoAberto />)

    expect(
      screen.getByRole("link", { name: /nova partida/i }),
    ).toHaveAttribute("href", "/dashboard/partidas/nova")
    expect(
      screen.getByRole("link", { name: /^criar torneio$/i }),
    ).toHaveAttribute("href", "/dashboard/torneios/novo")
    expect(
      screen.queryByRole("link", { name: /ver meus torneios/i }),
    ).not.toBeInTheDocument()
  })

  it("a11y: ícones decorativos são aria-hidden", () => {
    const { container } = render(
      <EmptyActiveMatches semTorneios temAvulsoAberto={false} />,
    )
    // Nenhum SVG (lucide) fica exposto à árvore de acessibilidade.
    const svgs = container.querySelectorAll("svg")
    expect(svgs.length).toBeGreaterThan(0)
    svgs.forEach((svg) => {
      const hiddenSelf = svg.getAttribute("aria-hidden") === "true"
      const hiddenParent =
        svg.closest("[aria-hidden='true']") !== null
      expect(hiddenSelf || hiddenParent).toBe(true)
    })
  })
})
