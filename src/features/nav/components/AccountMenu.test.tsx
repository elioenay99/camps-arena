// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

// logout é uma server action ("use server") que arrasta env/supabase server —
// mockar para não importar a stack de servidor em jsdom. O form só precisa de
// uma função como action.
vi.mock("@/actions/auth", () => ({
  logout: vi.fn(),
}))

// next/link vira um <a> simples (o prefetch NÃO vira atributo do DOM), repassando
// onClick/className para as asserções de href e fechamento seguirem valendo.
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

import { AccountMenu } from "@/features/nav/components/AccountMenu"

const USER_ID = "abc-123"

afterEach(cleanup)

// jsdom: usar fireEvent.click (não userEvent — o Popper não resolve
// pointer-events/posição); PopoverContent sem seta (ResizeObserver ausente).
// Asserções só de presença/atributos.
describe("AccountMenu — menu de conta no avatar", () => {
  function abrir() {
    render(<AccountMenu userId={USER_ID} nome="Ataias" avatar={null} />)
    const gatilho = screen.getByRole("button", { name: "Sua conta" })
    fireEvent.click(gatilho)
    return gatilho
  }

  it("o gatilho tem aria-label 'Sua conta' e aria-haspopup", () => {
    render(<AccountMenu userId={USER_ID} nome="Ataias" avatar={null} />)
    const gatilho = screen.getByRole("button", { name: "Sua conta" })
    expect(gatilho).toBeInTheDocument()
    expect(gatilho).toHaveAttribute("aria-haspopup")
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
  })

  it("abre o menu com os três itens", () => {
    const gatilho = abrir()
    expect(gatilho).toHaveAttribute("aria-expanded", "true")
    expect(
      screen.getByRole("link", { name: "Meu perfil de técnico" })
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Conta" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument()
  })

  it("'Meu perfil de técnico' aponta para o próprio id", () => {
    abrir()
    expect(
      screen.getByRole("link", { name: "Meu perfil de técnico" })
    ).toHaveAttribute("href", `/dashboard/ligas/tecnico/${USER_ID}`)
  })

  it("'Conta' aponta para /dashboard/conta", () => {
    abrir()
    expect(screen.getByRole("link", { name: "Conta" })).toHaveAttribute(
      "href",
      "/dashboard/conta"
    )
  })

  it("'Sair' é um submit dentro de um <form> (server action de logout)", () => {
    abrir()
    const sair = screen.getByRole("button", { name: "Sair" })
    expect(sair).toHaveAttribute("type", "submit")
    expect(sair.closest("form")).not.toBeNull()
  })

  it("fecha ao pressionar Escape", () => {
    const gatilho = abrir()
    expect(gatilho).toHaveAttribute("aria-expanded", "true")
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    })
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
  })

  it("navegar por um Link fecha o menu", () => {
    const gatilho = abrir()
    fireEvent.click(screen.getByRole("link", { name: "Conta" }))
    expect(gatilho).toHaveAttribute("aria-expanded", "false")
  })
})
