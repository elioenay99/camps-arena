// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { CompartilharClassificacaoButton } from "@/features/standings/components/CompartilharClassificacaoButton"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

vi.mock("@/lib/compartilharWhatsApp", () => ({
  compartilharWhatsApp: vi.fn(async () => {}),
}))

const PROPS = {
  imagemPath: "/dashboard/torneios/11111111-1111-4111-8111-111111111111/classificacao/imagem",
  titulo: "Liga da Firma",
  texto: "Liga da Firma — Classificação\n\nLíder: Alfa\n\nVeja: http://x",
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(compartilharWhatsApp).mockClear()
})

describe("CompartilharClassificacaoButton", () => {
  it("mostra o rótulo 'Compartilhar classificação'", () => {
    render(<CompartilharClassificacaoButton {...PROPS} />)
    expect(screen.getByRole("button")).toHaveTextContent("Compartilhar classificação")
  })

  it("clicar chama compartilharWhatsApp com texto, title e getFile (a imagem)", async () => {
    render(<CompartilharClassificacaoButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(compartilharWhatsApp).toHaveBeenCalledTimes(1))
    const arg = vi.mocked(compartilharWhatsApp).mock.calls[0][0]
    expect(arg.texto).toBe(PROPS.texto)
    expect(arg.title).toBe("Liga da Firma — Classificação")
    expect(typeof arg.getFile).toBe("function")

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
