// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refreshMock = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock("@/actions/tournaments", () => ({ definirListadaTorneio: vi.fn() }))
vi.mock("@/actions/leaguePyramid", () => ({ definirListadaLiga: vi.fn() }))

import { ListarVitrineToggle } from "@/features/discovery/components/ListarVitrineToggle"
import { definirListadaTorneio } from "@/actions/tournaments"
import { definirListadaLiga } from "@/actions/leaguePyramid"
import { toast } from "sonner"

const mockTorneio = vi.mocked(definirListadaTorneio)
const mockLiga = vi.mocked(definirListadaLiga)
const mockToast = vi.mocked(toast)

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("ListarVitrineToggle", () => {
  it("torneio: liga o toggle → chama a action e dá refresh no sucesso", async () => {
    mockTorneio.mockResolvedValue({ ok: true })
    render(
      <ListarVitrineToggle tipo="torneio" tournamentId="t-1" listada={false} />
    )

    const check = screen.getByRole("checkbox")
    expect(check).not.toBeChecked()
    await userEvent.click(check)

    await waitFor(() =>
      expect(mockTorneio).toHaveBeenCalledWith({
        tournamentId: "t-1",
        listada: true,
      })
    )
    expect(mockToast.success).toHaveBeenCalled()
    expect(refreshMock).toHaveBeenCalled()
  })

  it("liga: desliga o toggle → chama a action da liga com competitionId+seasonId", async () => {
    mockLiga.mockResolvedValue({ ok: true })
    render(
      <ListarVitrineToggle
        tipo="liga"
        competitionId="comp-1"
        seasonId="s-1"
        listada={true}
      />
    )

    const check = screen.getByRole("checkbox")
    expect(check).toBeChecked()
    await userEvent.click(check)

    await waitFor(() =>
      expect(mockLiga).toHaveBeenCalledWith({
        competitionId: "comp-1",
        seasonId: "s-1",
        listada: false,
      })
    )
  })

  it("erro na action: reverte o estado e mostra toast de erro", async () => {
    mockTorneio.mockResolvedValue({ ok: false, error: "Sem permissão." })
    render(
      <ListarVitrineToggle tipo="torneio" tournamentId="t-1" listada={false} />
    )

    const check = screen.getByRole("checkbox")
    await userEvent.click(check)

    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Sem permissão.")
    )
    // Otimista revertido: volta a desmarcado.
    expect(screen.getByRole("checkbox")).not.toBeChecked()
    expect(refreshMock).not.toHaveBeenCalled()
  })
})
