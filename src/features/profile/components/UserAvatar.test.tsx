// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// next/image → <img> simples (sem o otimizador, p/ assertir o src direto).
vi.mock("next/image", () => ({
  default: (props: { src: unknown; alt?: string; onError?: () => void }) => {
    const src = typeof props.src === "string" ? props.src : ""
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={props.alt ?? ""} onError={props.onError} />
  },
}))

import { UserAvatar } from "@/features/profile/components/UserAvatar"

afterEach(cleanup)

describe("UserAvatar", () => {
  it("mostra iniciais (2 palavras) quando não há foto", () => {
    const { container } = render(<UserAvatar nome="Ana Souza" avatarUrl={null} />)
    expect(screen.getByText("AS")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  it("usa a inicial única para nome de uma palavra", () => {
    render(<UserAvatar nome="Pelé" avatarUrl={null} />)
    expect(screen.getByText("P")).toBeInTheDocument()
  })

  it("usa o rótulo 'Sem nome' (→ SN) quando o nome é nulo", () => {
    render(<UserAvatar nome={null} avatarUrl={null} />)
    expect(screen.getByText("SN")).toBeInTheDocument()
  })

  it("renderiza a foto quando há URL", () => {
    const { container } = render(
      <UserAvatar nome="Ana" avatarUrl="https://x/foto.png" />
    )
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute("src", "https://x/foto.png")
  })

  it("erro de carregamento cai para as iniciais", () => {
    const { container } = render(
      <UserAvatar nome="Ana Souza" avatarUrl="https://x/quebrada.png" />
    )
    fireEvent.error(container.querySelector("img") as HTMLImageElement)
    expect(screen.getByText("AS")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })
})
