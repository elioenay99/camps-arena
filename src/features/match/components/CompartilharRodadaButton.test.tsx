// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CompartilharRodadaButton } from "@/features/match/components/CompartilharRodadaButton"

const PROPS = {
  tournamentId: "11111111-1111-4111-8111-111111111111",
  rodada: 2,
  titulo: "Copa",
  texto: "Copa — 2a rodada Liberada\n\nA x B\n\nAcompanhe: http://x",
}

function setNav(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) {
      // remove a capability
      // @ts-expect-error jsdom navigator
      delete navigator[k]
    } else {
      Object.defineProperty(navigator, k, { configurable: true, value: v })
    }
  }
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"], { type: "image/png" }) }))
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setNav({ share: undefined, canShare: undefined })
})

describe("CompartilharRodadaButton", () => {
  it("celular com Web Share de arquivo: chama navigator.share com files", async () => {
    const share = vi.fn<(data?: ShareData) => Promise<void>>(async () => {})
    setNav({ share, canShare: () => true })
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const arg = share.mock.calls[0][0] as unknown as ShareData & { files?: File[] }
    expect(arg.files?.length).toBe(1)
    expect(arg.text).toBe(PROPS.texto)
  })

  it("desktop sem Web Share: pré-abre a aba (sem noopener) e a redireciona ao wa.me", async () => {
    setNav({ share: undefined, canShare: undefined })
    const writeText = vi.fn(async () => {})
    setNav({ clipboard: { writeText } })
    const janela = { opener: {} as unknown, location: { href: "" } }
    const open = vi.fn(() => janela)
    vi.stubGlobal("open", open)
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PROPS.texto))
    // pré-open SEM "noopener" (senão o retorno seria null e perderíamos a aba);
    // o opener é severado à mão e a MESMA aba vai ao wa.me (dentro do gesto).
    expect(open).toHaveBeenCalledWith("about:blank", "_blank")
    expect(janela.opener).toBeNull()
    await waitFor(() => expect(janela.location.href).toContain("https://wa.me/?text="))
    // não dispara um segundo window.open quando o pré-open funcionou
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("desktop com popup do pré-open bloqueado (null) cai no window.open do wa.me", async () => {
    setNav({ share: undefined, canShare: undefined })
    setNav({ clipboard: { writeText: vi.fn(async () => {}) } })
    const open = vi.fn(() => null) // popup-blocker barra o pré-open
    vi.stubGlobal("open", open)
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        expect.stringContaining("https://wa.me/?text="),
        "_blank",
        "noopener"
      )
    )
  })

  it("cancelar o share (AbortError) não cai no fallback", async () => {
    const erro = Object.assign(new Error("cancel"), { name: "AbortError" })
    const share = vi.fn(async () => {
      throw erro
    })
    const writeText = vi.fn(async () => {})
    setNav({ share, canShare: () => true, clipboard: { writeText } })
    render(<CompartilharRodadaButton {...PROPS} />)
    fireEvent.click(screen.getByRole("button"))
    await waitFor(() => expect(share).toHaveBeenCalled())
    // fallback (copiar) NÃO deve rodar quando o usuário só cancelou
    expect(writeText).not.toHaveBeenCalled()
  })
})
