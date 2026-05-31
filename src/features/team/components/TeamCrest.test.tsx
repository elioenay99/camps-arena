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

  it("limita as iniciais às duas primeiras palavras", () => {
    render(<TeamCrest nome="Red Bull Bragantino" escudoUrl={null} />)
    expect(screen.getByText("RB")).toBeInTheDocument()
  })

  it("usa '?' para nome vazio ou em branco", () => {
    render(<TeamCrest nome="   " escudoUrl={null} />)
    expect(screen.getByText("?")).toBeInTheDocument()
  })

  it("preserva inicial acentuada e code points fora do BMP", () => {
    const { rerender } = render(<TeamCrest nome="Atlético Mineiro" escudoUrl={null} />)
    expect(screen.getByText("AM")).toBeInTheDocument()
    rerender(<TeamCrest nome="𝕏 United" escudoUrl={null} />)
    expect(screen.getByText("𝕏U")).toBeInTheDocument()
  })

  it("renderiza o escudo sem coexistir com o placeholder", () => {
    const url = "https://media.api-sports.io/football/teams/127.png"
    const { container } = render(<TeamCrest nome="Flamengo" escudoUrl={url} />)
    expect(container.querySelector("img")).toHaveAttribute("src", url)
    // iniciais NÃO coexistem com a imagem (ternário exclusivo)
    expect(screen.queryByText("F")).not.toBeInTheDocument()
  })

  it("é decorativo: wrapper aria-hidden e img com alt vazio (ambos os modos)", () => {
    const url = "https://media.api-sports.io/football/teams/127.png"
    const { container, rerender } = render(<TeamCrest nome="Flamengo" escudoUrl={url} />)
    expect(container.querySelector("span[aria-hidden]")).toHaveAttribute("aria-hidden", "true")
    // decorativa: alt vazio, não o nome do clube
    expect(container.querySelector("img")).toHaveAttribute("alt", "")
    rerender(<TeamCrest nome="Flamengo" escudoUrl={null} />)
    expect(container.querySelector("span")).toHaveAttribute("aria-hidden", "true")
  })

  it("cai para o placeholder se a imagem falhar ao carregar", () => {
    const url = "https://media.api-sports.io/football/teams/130.png"
    const { container } = render(<TeamCrest nome="Grêmio" escudoUrl={url} />)
    fireEvent.error(container.querySelector("img")!)
    expect(screen.getByText("G")).toBeInTheDocument()
    expect(container.querySelector("img")).toBeNull()
  })

  it("NÃO recupera o escudo se escudoUrl mudar depois de um erro (estado preso)", () => {
    const a = "https://media.api-sports.io/football/teams/130.png"
    const b = "https://media.api-sports.io/football/teams/127.png"
    const { container, rerender } = render(<TeamCrest nome="Grêmio" escudoUrl={a} />)
    fireEvent.error(container.querySelector("img")!)
    expect(container.querySelector("img")).toBeNull()
    rerender(<TeamCrest nome="Grêmio" escudoUrl={b} />)
    // documenta o comportamento atual: o estado `erro` não reseta na troca de prop
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getByText("G")).toBeInTheDocument()
  })

  it("aplica cor de fundo estável no placeholder e a remove quando há imagem", () => {
    const wrapper = (c: HTMLElement) => c.querySelector("span[aria-hidden]") as HTMLElement
    const { container: a1 } = render(<TeamCrest nome="Flamengo" escudoUrl={null} />)
    const { container: a2 } = render(<TeamCrest nome="Flamengo" escudoUrl={null} />)
    const { container: b } = render(<TeamCrest nome="Palmeiras" escudoUrl={null} />)
    const corA = wrapper(a1).style.backgroundColor
    expect(corA).not.toBe("")
    expect(wrapper(a2).style.backgroundColor).toBe(corA) // determinística p/ mesmo nome
    expect(wrapper(b).style.backgroundColor).not.toBe(corA) // varia por nome
    const { container: img } = render(<TeamCrest nome="Flamengo" escudoUrl="https://x/a.png" />)
    expect(wrapper(img).style.backgroundColor).toBe("") // sem cor quando há imagem
  })

  it("escala a fonte do placeholder pelo size, com piso de 9px", () => {
    const inner = (c: HTMLElement) => c.querySelector("span > span") as HTMLElement
    const { container, rerender } = render(<TeamCrest nome="Flamengo" escudoUrl={null} size={64} />)
    expect(inner(container)).toHaveStyle({ fontSize: "26px" }) // round(64*0.4)=26
    rerender(<TeamCrest nome="Flamengo" escudoUrl={null} size={10} />)
    expect(inner(container)).toHaveStyle({ fontSize: "9px" }) // round(4)=4 -> piso 9
  })
})
