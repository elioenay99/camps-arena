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

import { TeamCrest } from "@/features/team/components/TeamCrest"

afterEach(cleanup)

describe("TeamCrest", () => {
  it("mostra placeholder (iniciais) quando não há escudo", () => {
    const { container } = render(<TeamCrest nome="Real Madrid" escudoUrl={null} />)
    expect(screen.getByText("RM")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  it("usa a inicial única para nome de uma palavra", () => {
    render(<TeamCrest nome="Flamengo" escudoUrl={null} />)
    expect(screen.getByText("F")).toBeInTheDocument()
  })

  it("renderiza o escudo quando há URL", () => {
    const url = "https://media.api-sports.io/football/teams/127.png"
    const { container } = render(<TeamCrest nome="Flamengo" escudoUrl={url} />)
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    expect(img).toHaveAttribute("src", url)
  })

  it("cai para o placeholder se a imagem falhar ao carregar", () => {
    const url = "https://media.api-sports.io/football/teams/130.png"
    const { container } = render(<TeamCrest nome="Grêmio" escudoUrl={url} />)
    fireEvent.error(container.querySelector("img")!)
    expect(screen.getByText("G")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })
})
