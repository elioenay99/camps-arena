// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

const texto = "Copa — Times\n\nA — ❌\nB — Beto\n\nVeja: http://x"
const title = "Copa — Times"

function setNav(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) {
      // @ts-expect-error jsdom navigator
      delete navigator[k]
    } else {
      Object.defineProperty(navigator, k, { configurable: true, value: v })
    }
  }
}

async function pngFalso(): Promise<File> {
  return new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" })
}

beforeEach(() => {
  setNav({ share: undefined, canShare: undefined, clipboard: undefined })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setNav({ share: undefined, canShare: undefined, clipboard: undefined })
})

describe("compartilharWhatsApp", () => {
  it("Web Share com getFile: share com files + text + title", async () => {
    const share = vi.fn<(d?: ShareData) => Promise<void>>(async () => {})
    setNav({ share, canShare: () => true })
    await compartilharWhatsApp({ texto, title, getFile: pngFalso })
    expect(share).toHaveBeenCalledTimes(1)
    const arg = share.mock.calls[0][0] as ShareData & { files?: File[] }
    expect(arg.files?.length).toBe(1)
    expect(arg.text).toBe(texto)
    expect(arg.title).toBe(title)
  })

  it("Web Share SEM getFile: share text-only (sem files)", async () => {
    const share = vi.fn<(d?: ShareData) => Promise<void>>(async () => {})
    setNav({ share }) // sem canShare → canShare?.(dados) ?? true ⇒ true
    await compartilharWhatsApp({ texto, title })
    expect(share).toHaveBeenCalledTimes(1)
    const arg = share.mock.calls[0][0] as ShareData & { files?: File[] }
    expect(arg.files).toBeUndefined()
    expect(arg.text).toBe(texto)
  })

  it("getFile presente mas canShare(files) false: cai para text-only (sem files)", async () => {
    const share = vi.fn<(d?: ShareData) => Promise<void>>(async () => {})
    // canShare nega arquivos mas aceita o resto.
    const canShare = vi.fn((d?: ShareData & { files?: File[] }) => !d?.files)
    setNav({ share, canShare })
    await compartilharWhatsApp({ texto, title, getFile: pngFalso })
    const arg = share.mock.calls[0][0] as ShareData & { files?: File[] }
    expect(arg.files).toBeUndefined()
    expect(arg.text).toBe(texto)
  })

  it("desktop sem Web Share: pré-abre a aba (sem noopener) e a redireciona ao wa.me", async () => {
    const writeText = vi.fn(async () => {})
    setNav({ share: undefined, clipboard: { writeText } })
    const janela = { opener: {} as unknown, location: { href: "" } }
    const open = vi.fn(() => janela)
    vi.stubGlobal("open", open)
    await compartilharWhatsApp({ texto, title })
    expect(open).toHaveBeenCalledWith("about:blank", "_blank")
    expect(janela.opener).toBeNull()
    expect(writeText).toHaveBeenCalledWith(texto)
    expect(janela.location.href).toContain("https://wa.me/?text=")
    expect(open).toHaveBeenCalledTimes(1) // não dispara um segundo open
  })

  it("desktop com pré-open bloqueado (null): window.open do wa.me com noopener", async () => {
    setNav({ share: undefined, clipboard: { writeText: vi.fn(async () => {}) } })
    const open = vi.fn(() => null) // popup-blocker barra o pré-open
    vi.stubGlobal("open", open)
    await compartilharWhatsApp({ texto, title })
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank",
      "noopener"
    )
  })

  it("cancelar o share (AbortError) NÃO cai no fallback", async () => {
    const erro = Object.assign(new Error("cancel"), { name: "AbortError" })
    const share = vi.fn(async () => {
      throw erro
    })
    const writeText = vi.fn(async () => {})
    setNav({ share, canShare: () => true, clipboard: { writeText } })
    await compartilharWhatsApp({ texto, title })
    expect(share).toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })

  it("erro do share NÃO-Abort: cai no fallback (copia + abre wa.me)", async () => {
    const erro = Object.assign(new Error("falhou"), { name: "NotAllowedError" })
    const share = vi.fn(async () => {
      throw erro
    })
    const writeText = vi.fn(async () => {})
    setNav({ share, canShare: () => true, clipboard: { writeText } })
    const open = vi.fn(() => null)
    vi.stubGlobal("open", open)
    await compartilharWhatsApp({ texto, title })
    expect(share).toHaveBeenCalled()
    // fallback acionado: texto copiado e wa.me aberto
    expect(writeText).toHaveBeenCalledWith(texto)
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining("https://wa.me/?text="),
      "_blank",
      "noopener"
    )
  })
})
