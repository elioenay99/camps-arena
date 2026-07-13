// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CelebracaoTitulo } from "@/features/knockout/components/CelebracaoTitulo"

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduce,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("CelebracaoTitulo", () => {
  it("dispara o confete na COR do campeão (movimento normal)", () => {
    mockReducedMotion(false)
    render(<CelebracaoTitulo cor="#bd93f9" chaveId="k1" />)
    const overlay = screen.getByTestId("celebracao-confete")
    expect(overlay).toBeInTheDocument()
    // cor entra por CSS custom property (não cor fixa).
    expect(overlay.style.getPropertyValue("--burst-cor")).toBe("#bd93f9")
  })

  it("reduced-motion NÃO monta o confete", () => {
    mockReducedMotion(true)
    render(<CelebracaoTitulo cor="#bd93f9" chaveId="k2" />)
    expect(screen.queryByTestId("celebracao-confete")).not.toBeInTheDocument()
  })

  it("dispara só UMA vez por chave (guard sessionStorage) — não reanima ao renavegar", () => {
    mockReducedMotion(false)
    const { unmount } = render(<CelebracaoTitulo cor="#bd93f9" chaveId="k3" />)
    expect(screen.getByTestId("celebracao-confete")).toBeInTheDocument()
    unmount()
    // Segunda montagem da MESMA chave (ex.: router.refresh): não celebra de novo.
    render(<CelebracaoTitulo cor="#bd93f9" chaveId="k3" />)
    expect(screen.queryByTestId("celebracao-confete")).not.toBeInTheDocument()
  })

  it("chaves distintas celebram cada uma", () => {
    mockReducedMotion(false)
    const { unmount } = render(<CelebracaoTitulo cor="#bd93f9" chaveId="k4" />)
    expect(screen.getByTestId("celebracao-confete")).toBeInTheDocument()
    unmount()
    render(<CelebracaoTitulo cor="#bd93f9" chaveId="k5" />)
    expect(screen.getByTestId("celebracao-confete")).toBeInTheDocument()
  })
})
