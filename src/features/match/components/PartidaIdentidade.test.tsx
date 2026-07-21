// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  PartidaIdentidade,
  rotuloRodada,
} from "@/features/match/components/PartidaIdentidade"

afterEach(cleanup)

describe("rotuloRodada", () => {
  it("partida avulsa (sem rodada) não tem rótulo", () => {
    expect(rotuloRodada({ rodada: null, grupo: null, perna: null })).toBeNull()
  })

  it("monta rodada, grupo e perna como as listas montavam à mão", () => {
    expect(rotuloRodada({ rodada: 1, grupo: null, perna: null })).toBe("R1")
    expect(rotuloRodada({ rodada: 3, grupo: 2, perna: null })).toBe("G2 R3")
    expect(rotuloRodada({ rodada: 1, grupo: null, perna: 1 })).toBe("R1 ida")
    expect(rotuloRodada({ rodada: 1, grupo: null, perna: 2 })).toBe("R1 volta")
  })
})

describe("PartidaIdentidade", () => {
  it("mantém os dois nomes no DOM (a ocultação no mobile é só CSS) e o miolo", () => {
    render(
      <PartidaIdentidade rodadaLabel="R7" nome1="Remo" nome2="Botafogo">
        <span>2 x 1</span>
      </PartidaIdentidade>
    )
    // Nome no DOM em todos os breakpoints: preserva busca do navegador e o
    // texto acessível dos consumidores.
    expect(screen.getByText("Remo")).toBeInTheDocument()
    expect(screen.getByText("Botafogo")).toBeInTheDocument()
    expect(screen.getByText("R7")).toBeInTheDocument()
    expect(screen.getByText("2 x 1")).toBeInTheDocument()
  })

  it("com escudo cadastrado renderiza a imagem do clube", () => {
    const { container } = render(
      <PartidaIdentidade
        nome1="Remo"
        nome2="Botafogo"
        escudo1="https://exemplo.test/remo.png"
      >
        <span>0 x 0</span>
      </PartidaIdentidade>
    )
    expect(container.querySelectorAll("img")).toHaveLength(1)
  })

  it("sem escudo cai nas iniciais — lado por-nome/avulso segue identificável", () => {
    const { container } = render(
      <PartidaIdentidade nome1="Remo" nome2="Botafogo Futebol">
        <span>0 x 0</span>
      </PartidaIdentidade>
    )
    expect(container.querySelectorAll("img")).toHaveLength(0)
    expect(screen.getByText("R")).toBeInTheDocument()
    expect(screen.getByText("BF")).toBeInTheDocument()
  })
})
