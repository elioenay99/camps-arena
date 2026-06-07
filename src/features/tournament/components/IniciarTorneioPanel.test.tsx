// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A folha client (botão) chama a Server Action — neutralizada no render.
vi.mock("@/actions/tournaments", () => ({ iniciarTorneio: vi.fn() }))

import { IniciarTorneioPanel } from "@/features/tournament/components/IniciarTorneioPanel"

const TORNEIO = "11111111-1111-4111-8111-111111111111"

afterEach(cleanup)

describe("IniciarTorneioPanel", () => {
  it("mostra a prévia do MESMO motor e habilita o botão com elenco válido", () => {
    render(
      <IniciarTorneioPanel
        tournamentId={TORNEIO}
        qtdParticipantes={4}
        idaEVolta={true}
      />
    )
    // 4 participantes ida-e-volta: 12 partidas em 6 rodadas (previaLiga).
    expect(screen.getByText(/12 partidas em 6 rodadas/)).toBeInTheDocument()
    expect(screen.getByText(/ida e volta/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Iniciar torneio" })
    ).toBeEnabled()
  })

  it("ida simples calcula a prévia sem o returno", () => {
    render(
      <IniciarTorneioPanel
        tournamentId={TORNEIO}
        qtdParticipantes={4}
        idaEVolta={false}
      />
    )
    expect(screen.getByText(/6 partidas em 3 rodadas/)).toBeInTheDocument()
  })

  it("com menos de 2 clubes orienta e desabilita o botão", () => {
    render(
      <IniciarTorneioPanel
        tournamentId={TORNEIO}
        qtdParticipantes={1}
        idaEVolta={false}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent(/pelo menos 2 clubes/)
    expect(
      screen.getByRole("button", { name: "Iniciar torneio" })
    ).toBeDisabled()
  })

  it("acima do limite avisa e desabilita o botão", () => {
    render(
      <IniciarTorneioPanel
        tournamentId={TORNEIO}
        qtdParticipantes={21}
        idaEVolta={false}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent(/no máximo 20/)
    expect(
      screen.getByRole("button", { name: "Iniciar torneio" })
    ).toBeDisabled()
  })
})
