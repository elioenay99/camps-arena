// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Fechar rodada é client com action — marcador p/ asserir presença/rodada.
vi.mock("@/features/match/components/WoButtons", () => ({
  FecharRodadaButton: (p: { rodada: number }) => (
    <button data-testid="fechar">{`fechar-${p.rodada}`}</button>
  ),
}))

import { RoundPager } from "@/features/match/components/RoundPager"

afterEach(cleanup)

const rounds = [
  { rodada: 1, content: <div>rodada-1</div> },
  { rodada: 2, content: <div>rodada-2</div> },
  { rodada: 3, content: <div>rodada-3</div> },
]

describe("RoundPager", () => {
  it("abre na rodada inicial e mostra só ela", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={2} />)
    expect(screen.getByText("rodada-2")).toBeInTheDocument()
    expect(screen.queryByText("rodada-1")).toBeNull()
    expect(screen.queryByText("rodada-3")).toBeNull()
  })

  it("cai para a primeira rodada quando a inicial não existe", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={99} />)
    expect(screen.getByText("rodada-1")).toBeInTheDocument()
  })

  it("anterior/próxima navegam entre rodadas", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={2} />)
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }))
    expect(screen.getByText("rodada-3")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Rodada anterior" }))
    fireEvent.click(screen.getByRole("button", { name: "Rodada anterior" }))
    expect(screen.getByText("rodada-1")).toBeInTheDocument()
  })

  it("desabilita anterior na primeira e próxima na última", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={1} />)
    expect(screen.getByRole("button", { name: "Rodada anterior" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }))
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }))
    expect(screen.getByRole("button", { name: "Próxima rodada" })).toBeDisabled()
  })

  it("pular direto pelo seletor de rodada", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={1} />)
    fireEvent.change(screen.getByRole("combobox", { name: "Ir para a rodada" }), {
      target: { value: "3" }, // o value do option é o NÚMERO da rodada
    })
    expect(screen.getByText("rodada-3")).toBeInTheDocument()
  })

  it("ancorado à rodada: se uma rodada anterior some, mantém a rodada lida", () => {
    // Regressão (revisão 2026-06-26): o passador guardava um ÍNDICE de array.
    // Parado numa rodada do meio, quando uma rodada ANTERIOR é resolvida em
    // outro ponto da mesma aba (revalidação encolhe a lista), o índice
    // preservado teleportava o leitor p/ outra rodada. Agora ancora ao número.
    const { rerender } = render(<RoundPager rounds={rounds} rodadaInicial={1} />)
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" })) // rodada 2
    expect(screen.getByText("rodada-2")).toBeInTheDocument()
    // A rodada 1 some (revalidação): a lista vira [2, 3].
    rerender(<RoundPager rounds={[rounds[1], rounds[2]]} rodadaInicial={1} />)
    expect(screen.getByText("rodada-2")).toBeInTheDocument() // continua na 2
    expect(screen.queryByText("rodada-3")).toBeNull()
  })

  it("rodada selecionada que some cai para a rodada inicial/primeira disponível", () => {
    const { rerender } = render(<RoundPager rounds={rounds} rodadaInicial={1} />)
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" })) // rodada 2
    expect(screen.getByText("rodada-2")).toBeInTheDocument()
    // A própria rodada 2 (a que ele lia) some: fallback para a inicial (1).
    rerender(<RoundPager rounds={[rounds[0], rounds[2]]} rodadaInicial={1} />)
    expect(screen.getByText("rodada-1")).toBeInTheDocument()
  })

  it("Fechar rodada só aparece na rodada ativa quando pode fechar", () => {
    render(
      <RoundPager
        rounds={rounds}
        rodadaInicial={1}
        rodadaAtiva={2}
        tournamentId="t1"
        podeFechar
      />
    )
    expect(screen.queryByTestId("fechar")).toBeNull() // rodada 1: não-ativa
    fireEvent.click(screen.getByRole("button", { name: "Próxima rodada" }))
    expect(screen.getByTestId("fechar")).toHaveTextContent("fechar-2") // rodada 2: ativa
  })

  it("não mostra Fechar quando não pode fechar (mesmo na rodada ativa)", () => {
    render(<RoundPager rounds={rounds} rodadaInicial={2} rodadaAtiva={2} tournamentId="t1" />)
    expect(screen.queryByTestId("fechar")).toBeNull()
  })

  it("rodada única: navegação desabilitada nos dois sentidos", () => {
    render(
      <RoundPager rounds={[{ rodada: 5, content: <div>so-5</div> }]} rodadaInicial={5} />
    )
    expect(screen.getByText("so-5")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Rodada anterior" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Próxima rodada" })).toBeDisabled()
  })
})
