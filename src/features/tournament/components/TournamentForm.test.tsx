// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Server Actions e toast neutralizados — o alvo é a ÂNCORA de ajuda "Fase de
// liga" no card de formato (estrutura, não submissão).
vi.mock("@/actions/tournaments", () => ({ createTournament: vi.fn() }))
vi.mock("@/actions/teams", () => ({ selectTeam: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { TournamentForm } from "@/features/tournament/components/TournamentForm"

afterEach(cleanup)

describe("TournamentForm — âncora Fase de liga", () => {
  it("mostra o '?' de ajuda no card 'Fase de liga' e FORA do <label> do radio", () => {
    render(<TournamentForm />)
    const gatilho = screen.getByRole("button", { name: "O que é Fase de liga?" })
    expect(gatilho).toBeInTheDocument()
    // HTML válido: o gatilho NÃO está dentro do <label> do radio (senão o clique
    // acionaria o formato). O radio de fase_liga existe e é irmão, não ancestral.
    expect(gatilho.closest("label")).toBeNull()
    expect(
      document.querySelector('input[type="radio"][value="fase_liga"]')
    ).not.toBeNull()
  })

  it("só o card 'Fase de liga' tem gatilho de ajuda (um '?' por termo)", () => {
    render(<TournamentForm />)
    const ajudas = screen.getAllByRole("button", { name: /^O que é / })
    expect(ajudas.map((b) => b.getAttribute("aria-label"))).toEqual([
      "O que é Fase de liga?",
    ])
  })
})
