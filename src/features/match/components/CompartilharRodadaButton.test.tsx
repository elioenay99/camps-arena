// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharRodadaButton } from "@/features/match/components/CompartilharRodadaButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

// A orquestração do gesto é testada em compartilharWhatsApp.test.ts (fonte única);
// aqui só o WIRING do componente: rótulo + chamada com texto/title/getFile (a imagem).
vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  tournamentId: "11111111-1111-4111-8111-111111111111",
  rodada: 2,
  titulo: "Copa",
  texto: "Copa — 2a rodada Liberada\n\nA x B\n\nAcompanhe: http://x",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharRodadaButton", () => {
  it("mostra o rótulo da rodada", () => {
    render(<CompartilharRodadaButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar rodada 2")
  })

  it("clicar chama compartilharWhatsApp com texto, title e getFile (imagem da rodada)", async () => {
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe("Copa — Rodada 2")
    expect(typeof arg.getFile).toBe("function")

    // getFile baixa o PNG da rota da rodada (cookie same-origin).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }))
    )
    const file = await arg.getFile!()
    expect(file).toBeInstanceOf(File)
    expect(global.fetch).toHaveBeenCalledWith(
      `/dashboard/torneios/${PROPS.tournamentId}/rodada/${PROPS.rodada}/imagem`,
      { credentials: "same-origin" }
    )
  })

  it("getFile devolve null quando a imagem falha (sem quebrar o share)", async () => {
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalled())
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })))
    expect(await arg.getFile!()).toBeNull()
  })
})
