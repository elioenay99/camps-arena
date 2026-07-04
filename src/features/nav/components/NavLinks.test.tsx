// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// usePathname controla o item ativo e o "fechar ao navegar". Mutável entre testes.
let pathname = "/dashboard"
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}))

import { NavLinks, type NavLink } from "@/features/nav/components/NavLinks"

const LINKS: NavLink[] = [
  { href: "/dashboard", rotulo: "Painel", exato: true },
  { href: "/dashboard/torneios", rotulo: "Torneios" },
  { href: "/dashboard/ligas", rotulo: "Ligas" },
]

afterEach(cleanup)
beforeEach(() => {
  pathname = "/dashboard"
})

describe("NavLinks (disclosure mobile)", () => {
  it("mantém todos os links no DOM mesmo colapsado (visibilidade só por CSS)", () => {
    render(<NavLinks links={LINKS} />)
    for (const l of LINKS) {
      expect(screen.getByRole("link", { name: l.rotulo })).toBeInTheDocument()
    }
  })

  it("o toggle expõe aria-expanded/aria-controls e alterna ao clicar", async () => {
    render(<NavLinks links={LINKS} />)
    const toggle = screen.getByRole("button", { name: /menu de seções/i })
    expect(toggle).toHaveAttribute("aria-controls", "nav-secoes")
    expect(toggle).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("fecha ao navegar (mudança de pathname)", async () => {
    const { rerender } = render(<NavLinks links={LINKS} />)
    const toggle = screen.getByRole("button", { name: /menu de seções/i })
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")

    pathname = "/dashboard/ligas"
    rerender(<NavLinks links={LINKS} />)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("marca o item ativo com aria-current='page'", () => {
    pathname = "/dashboard/torneios/abc"
    render(<NavLinks links={LINKS} />)
    expect(screen.getByRole("link", { name: "Torneios" })).toHaveAttribute(
      "aria-current",
      "page"
    )
    expect(
      screen.getByRole("link", { name: "Painel" })
    ).not.toHaveAttribute("aria-current")
  })
})
