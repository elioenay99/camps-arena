// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharResultadoButton } from "@/features/match/components/CompartilharResultadoButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

// A orquestração do gesto é testada em compartilharWhatsApp.test.ts (fonte única);
// aqui só o WIRING: rótulo + chamada com texto/title/getFile (a imagem do resultado).
vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  tournamentId: "11111111-1111-4111-8111-111111111111",
  matchId: "33333333-3333-4333-8333-333333333333",
  nome1: "Grêmio",
  nome2: "Inter",
  texto: "Copa — Resultado\n\nGrêmio 2 x 1 Inter\n\nAcompanhe: http://x",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharResultadoButton", () => {
  it("mostra o rótulo 'Compartilhar resultado'", () => {
    render(<CompartilharResultadoButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar resultado")
  })

  it("clicar chama compartilharWhatsApp com texto, title (confronto) e getFile", async () => {
    render(<CompartilharResultadoButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe("Grêmio x Inter")
    expect(typeof arg.getFile).toBe("function")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }))
    )
    const file = await arg.getFile!()
    expect(file).toBeInstanceOf(File)
    expect(global.fetch).toHaveBeenCalledWith(
      `/dashboard/torneios/${PROPS.tournamentId}/partida/${PROPS.matchId}/imagem`,
      { credentials: "same-origin" }
    )
  })

  it("getFile devolve null quando a imagem falha (sem quebrar o share)", async () => {
    render(<CompartilharResultadoButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalled())
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })))
    expect(await arg.getFile!()).toBeNull()
  })
})
