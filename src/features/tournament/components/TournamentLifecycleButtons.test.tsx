// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/actions/tournaments", () => ({
  encerrarTorneio: vi.fn(async () => ({ ok: true })),
  reabrirTorneio: vi.fn(async () => ({ ok: true })),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { encerrarTorneio, reabrirTorneio } from "@/actions/tournaments"
import { TournamentLifecycleButtons } from "@/features/tournament/components/TournamentLifecycleButtons"

const mockEncerrar = vi.mocked(encerrarTorneio)
const mockReabrir = vi.mocked(reabrirTorneio)

const TORNEIO = "11111111-1111-4111-8111-111111111111"

afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())

describe("TournamentLifecycleButtons — encerrar com confirmação", () => {
  it("o PRIMEIRO clique só arma a confirmação (nenhuma action roda)", () => {
    render(
      <TournamentLifecycleButtons
        tournamentId={TORNEIO}
        encerrado={false}
        partidasAbertas={3}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Encerrar torneio" }))
    expect(mockEncerrar).not.toHaveBeenCalled()
    // O aviso cita a contagem de partidas que serão congeladas.
    expect(screen.getByRole("alert")).toHaveTextContent(/3 partidas em aberto/)
    expect(
      screen.getByRole("button", { name: "Confirmar encerramento" })
    ).toBeInTheDocument()
  })

  it("o SEGUNDO clique executa a action", async () => {
    render(
      <TournamentLifecycleButtons
        tournamentId={TORNEIO}
        encerrado={false}
        partidasAbertas={0}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Encerrar torneio" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmar encerramento" }))
    await waitFor(() => expect(mockEncerrar).toHaveBeenCalledWith(TORNEIO))
  })

  it("sem partidas abertas o aviso não inventa contagem", () => {
    render(
      <TournamentLifecycleButtons
        tournamentId={TORNEIO}
        encerrado={false}
        partidasAbertas={0}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Encerrar torneio" }))
    expect(screen.getByRole("alert")).toHaveTextContent(/Encerrar o torneio\?/)
    expect(screen.queryByText(/em aberto/)).toBeNull()
  })

  it("Cancelar desarma a confirmação sem executar", () => {
    render(
      <TournamentLifecycleButtons
        tournamentId={TORNEIO}
        encerrado={false}
        partidasAbertas={1}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Encerrar torneio" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(mockEncerrar).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Encerrar torneio" })).toBeInTheDocument()
  })
})

describe("TournamentLifecycleButtons — reabrir", () => {
  it("torneio encerrado mostra só Reabrir, que roda direto (não-destrutivo)", async () => {
    render(
      <TournamentLifecycleButtons
        tournamentId={TORNEIO}
        encerrado
        partidasAbertas={0}
      />
    )
    expect(screen.queryByRole("button", { name: /Encerrar/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Reabrir torneio" }))
    await waitFor(() => expect(mockReabrir).toHaveBeenCalledWith(TORNEIO))
  })
})
