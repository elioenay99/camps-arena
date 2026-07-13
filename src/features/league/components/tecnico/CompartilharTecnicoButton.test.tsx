// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharTecnicoButton } from "@/features/league/components/tecnico/CompartilharTecnicoButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  userId: "77777777-7777-4777-8777-777777777777",
  nome: "Fulano",
  texto: "Confira a carreira de Fulano como técnico no Goliseu: http://x",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharTecnicoButton", () => {
  it("mostra o rótulo 'Compartilhar pôster'", () => {
    render(<CompartilharTecnicoButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar pôster")
  })

  it("clicar chama compartilharWhatsApp com texto/title e baixa o PNG do técnico", async () => {
    render(<CompartilharTecnicoButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe("Fulano — Técnico")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }))
    )
    const file = await arg.getFile!()
    expect(file).toBeInstanceOf(File)
    expect(global.fetch).toHaveBeenCalledWith(
      `/dashboard/ligas/tecnico/${PROPS.userId}/imagem`,
      { credentials: "same-origin" }
    )
  })
})
