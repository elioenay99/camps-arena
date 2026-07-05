// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// usePathname controla o item ativo e o "fechar ao navegar". Mutável entre testes.
let pathname = "/dashboard"
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}))

// Captura a prop `prefetch` do next/link (que NÃO vira atributo do DOM) num
// data-attr, para afirmar o contrato "nav não prefetcha as seções em massa".
// Repassa `...rest` (aria-current, className) → os demais testes seguem valendo.
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...rest
  }: {
    children: ReactNode
    href: string
    prefetch?: boolean | null
  } & Record<string, unknown>) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}))

import { NavLinks, type NavLink } from "@/features/nav/components/NavLinks"

const LINKS: NavLink[] = [
  { href: "/dashboard", rotulo: "Painel", exato: true },
  { href: "/dashboard/torneios", rotulo: "Torneios" },
  { href: "/dashboard/ligas", rotulo: "Pirâmides" },
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

  it("nenhum link de seção dispara prefetch automático (prefetch={false})", () => {
    render(<NavLinks links={LINKS} />)
    for (const l of LINKS) {
      // Navegação por clique intacta (o link existe)...
      const link = screen.getByRole("link", { name: l.rotulo })
      // ...mas sem prefetch: a nav aparece em TODA página e prefetcharia as ~6
      // rotas de seção (RSC caras) de uma vez, estourando a borda da Vercel (503).
      expect(link).toHaveAttribute("data-prefetch", "false")
    }
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
