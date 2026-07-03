// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

import { CompartilharCompetitionButton } from "@/features/discovery/components/CompartilharCompetitionButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

const mockCompartilhar = vi.mocked(compartilharWhatsApp)

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("CompartilharCompetitionButton", () => {
  it("clica → compartilha o link ABSOLUTO (origin + path) com o título", async () => {
    render(
      <CompartilharCompetitionButton
        path="/dashboard/torneios/t-1"
        titulo="Torneio Y"
      />
    )

    await userEvent.click(screen.getByRole("button", { name: /compartilhar/i }))

    await waitFor(() => expect(mockCompartilhar).toHaveBeenCalledTimes(1))
    const arg = mockCompartilhar.mock.calls[0][0]
    expect(arg.title).toBe("Torneio Y")
    // URL absoluta: origin do jsdom + o path canônico.
    expect(arg.texto).toContain(`${window.location.origin}/dashboard/torneios/t-1`)
    expect(arg.texto).toContain("Torneio Y")
    // Só link — sem getFile (o compartilhamento não anexa imagem).
    expect(arg.getFile).toBeUndefined()
  })
})
