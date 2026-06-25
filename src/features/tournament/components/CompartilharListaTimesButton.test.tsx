// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharListaTimesButton } from "@/features/tournament/components/CompartilharListaTimesButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

// A orquestração do gesto é testada em compartilharWhatsApp.test.ts (fonte única);
// aqui só o WIRING: rótulo + chamada text-only (SEM getFile, sem imagem).
vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  titulo: "Copa",
  texto: "Copa — Times\n\nA — ❌\nB — Beto\n\nVeja: http://x",
}

afterEach(() => {
  cleanup()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharListaTimesButton", () => {
  it("mostra o rótulo 'Compartilhar lista'", () => {
    render(<CompartilharListaTimesButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar lista")
  })

  it("clicar chama compartilharWhatsApp com texto e title, SEM getFile (text-only)", async () => {
    render(<CompartilharListaTimesButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe("Copa — Times")
    expect(arg.getFile).toBeUndefined()
  })
})
