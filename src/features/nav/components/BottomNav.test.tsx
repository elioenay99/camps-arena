// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// usePathname decide o destino ativo. Mutável entre testes.
let pathname = "/dashboard"
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}))

// Captura a prop `prefetch` (que NÃO vira atributo do DOM) num data-attr, para
// afirmar o contrato "a barra não prefetcha as seções em massa".
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

import { BottomNav } from "@/features/nav/components/BottomNav"

const DESTINOS = [
  { rotulo: "Painel", href: "/dashboard" },
  { rotulo: "Torneios", href: "/dashboard/torneios" },
  { rotulo: "Pirâmides", href: "/dashboard/ligas" },
  { rotulo: "Explorar", href: "/dashboard/explorar" },
]

afterEach(cleanup)
beforeEach(() => {
  pathname = "/dashboard"
})

describe("BottomNav — navegação inferior do mobile", () => {
  it("expõe os 4 destinos com a rota real de cada um", () => {
    render(<BottomNav />)
    for (const d of DESTINOS) {
      expect(screen.getByRole("link", { name: d.rotulo })).toHaveAttribute(
        "href",
        d.href,
      )
    }
  })

  it("cada destino tem RÓTULO TEXTUAL, não só ícone", () => {
    render(<BottomNav />)
    for (const d of DESTINOS) {
      // getByText falha se o rótulo virar apenas um ícone/aria-label.
      expect(screen.getByText(d.rotulo)).toBeInTheDocument()
    }
  })

  it("'/dashboard' só ativa por igualdade EXATA (não em sub-rota)", () => {
    pathname = "/dashboard/torneios/abc"
    render(<BottomNav />)
    expect(screen.getByRole("link", { name: "Painel" })).not.toHaveAttribute(
      "aria-current",
    )
    expect(screen.getByRole("link", { name: "Torneios" })).toHaveAttribute(
      "aria-current",
      "page",
    )
  })

  it("os demais destinos ativam por PREFIXO", () => {
    pathname = "/dashboard/ligas/xyz/temporada/2"
    render(<BottomNav />)
    expect(screen.getByRole("link", { name: "Pirâmides" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    // Um destino ativo por vez: prefixo não pode vazar entre seções.
    expect(screen.getByRole("link", { name: "Explorar" })).not.toHaveAttribute(
      "aria-current",
    )
  })

  it("nenhum destino dispara prefetch automático", () => {
    render(<BottomNav />)
    for (const d of DESTINOS) {
      // A barra aparece em TODA página do dashboard: prefetchar as 4 rotas RSC
      // de uma vez estourava a borda da Vercel (503).
      expect(screen.getByRole("link", { name: d.rotulo })).toHaveAttribute(
        "data-prefetch",
        "false",
      )
    }
  })

  it("é `sm:hidden` e carrega o id que o CSS do toast usa como âncora", () => {
    const { container } = render(<BottomNav />)
    const nav = container.querySelector("nav")
    // O id é contrato com globals.css (`body:has(#nav-inferior)`): renomear sem
    // atualizar o CSS devolve o toast para cima da navegação.
    expect(nav).toHaveAttribute("id", "nav-inferior")
    expect(nav?.className).toContain("sm:hidden")
    // Reserva da área segura: `fixed` mede da viewport e ignora o padding que o
    // body já paga.
    expect(nav?.className).toContain("pb-[env(safe-area-inset-bottom)]")
  })
})
