// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharTemporadaButton } from "@/features/league/components/CompartilharTemporadaButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  imagemPath: "/dashboard/ligas/11111111-1111-4111-8111-111111111111/temporada/44444444-4444-4444-8444-444444444444/imagem",
  titulo: "Pirâmide — Temporada 3",
  texto: "Pirâmide — Temporada 3\n\nConfira a temporada no Goliseu: http://x",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharTemporadaButton", () => {
  it("mostra o rótulo 'Compartilhar temporada'", () => {
    render(<CompartilharTemporadaButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar temporada")
  })

  it("clicar chama compartilharWhatsApp com texto/title e baixa o PNG da temporada", async () => {
    render(<CompartilharTemporadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe(PROPS.titulo)

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }))
    )
    const file = await arg.getFile!()
    expect(file).toBeInstanceOf(File)
    expect(global.fetch).toHaveBeenCalledWith(PROPS.imagemPath, {
      credentials: "same-origin",
    })
  })
})
