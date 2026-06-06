// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { BracketView } from "@/features/knockout/components/BracketView"
import type { PartidaDaChave } from "@/features/standings/data/getTournamentClassificacao"

afterEach(cleanup)

/**
 * Builder de partida da chave: defaults neutros (jogo único agendado, sem
 * placar) para que cada caso declare APENAS o que importa — a view deriva
 * tamanho/fase/rótulo das próprias partidas, então o shape precisa ser fiel.
 */
function partida(over: Partial<PartidaDaChave>): PartidaDaChave {
  return {
    id: "m",
    rodada: 1,
    posicao: 1,
    perna: null,
    participante_1: "p1",
    participante_2: "p2",
    nome_1: "Lado 1",
    nome_2: "Lado 2",
    placar_1: 0,
    placar_2: 0,
    status: "agendada",
    ...over,
  }
}

describe("BracketView — colunas por fase e slots futuros", () => {
  it("chave de 4 com só a 1ª fase rotula 'Semifinais'/'Final' e mostra 'A definir' na fase não gerada", () => {
    // Duas posicoes na fase 1 ⇒ tamanho 4 ⇒ 2 fases. A final ainda não foi
    // gerada: a coluna existe (vem do nº de fases, não das partidas) mas o
    // slot é placeholder.
    render(
      <BracketView
        partidas={[
          partida({ id: "s1", rodada: 1, posicao: 1, nome_1: "Ana", nome_2: "Beto" }),
          partida({ id: "s2", rodada: 1, posicao: 2, nome_1: "Caio", nome_2: "Dani" }),
        ]}
      />
    )

    expect(screen.getByRole("heading", { name: "Semifinais" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Final" })).toBeInTheDocument()

    // A coluna Final (fase 2, ainda sem partidas) renderiza o placeholder.
    const final = screen.getByRole("region", { name: "Final" })
    expect(within(final).getAllByText("A definir")).toHaveLength(2)
  })

  it("com 3º lugar previsto, a coluna final futura mostra DOIS placeholders", () => {
    // Chave de 4 sem bye + terceiroLugar: a fase final terá final + disputa
    // de 3º — o placeholder não pode subcontar (1 card) o que virá (2).
    render(
      <BracketView
        terceiroLugar
        partidas={[
          partida({ id: "s1", rodada: 1, posicao: 1 }),
          partida({ id: "s2", rodada: 1, posicao: 2 }),
        ]}
      />
    )
    const final = screen.getByRole("region", { name: "Final" })
    // 2 cards de placeholder × 2 linhas "A definir" cada.
    expect(within(final).getAllByText("A definir")).toHaveLength(4)
  })

  it("com 3º lugar mas semi-bye (N=3), o placeholder volta a ser um só", () => {
    // Chave de 4 com bye na 1ª fase: não haverá dois perdedores reais nas
    // semis ⇒ o 3º lugar NÃO será gerado (mesma regra do motor).
    render(
      <BracketView
        terceiroLugar
        partidas={[
          partida({ id: "s1", rodada: 1, posicao: 1, participante_2: null, status: "encerrada" }),
          partida({ id: "s2", rodada: 1, posicao: 2 }),
        ]}
      />
    )
    const final = screen.getByRole("region", { name: "Final" })
    expect(within(final).getAllByText("A definir")).toHaveLength(2)
  })
})

describe("BracketView — bye", () => {
  it("card de bye mostra o nome e 'Avança direto (bye)' sem placar cru", () => {
    // Chave de 2 com posicao 1 bye (lado 2 nulo, nasce encerrada 0x0): único
    // confronto da chave ⇒ isola o card de bye sem placeholders/outros placares
    // poluindo a asserção. A view não pode exibir o "0 x 0" do avanço.
    render(
      <BracketView
        partidas={[
          partida({
            id: "bye",
            rodada: 1,
            posicao: 1,
            participante_2: null,
            nome_1: "Ana",
            nome_2: "A definir",
            status: "encerrada",
          }),
        ]}
      />
    )

    expect(screen.getByText("Ana")).toBeInTheDocument()
    expect(screen.getByText("Avança direto (bye)")).toBeInTheDocument()
    // O bye substitui a linha de placar por completo: nem o lado vazio
    // ("A definir") nem o placar 0x0 cru vazam para o card.
    expect(screen.queryByText("A definir")).not.toBeInTheDocument()
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })
})

describe("BracketView — confronto ida-e-volta", () => {
  it("renderiza rótulos 'Ida' e 'Volta' no mesmo card (mesma posicao)", () => {
    // Duas pernas (perna 1 e 2) do MESMO slot ⇒ agrupadas num único card.
    // Chave mínima de 2 não tem ida-e-volta na final, então usamos chave de 4
    // (posicao 2 presente) para que a fase 1 admita as pernas.
    render(
      <BracketView
        partidas={[
          partida({
            id: "ida",
            rodada: 1,
            posicao: 1,
            perna: 1,
            nome_1: "Ana",
            nome_2: "Beto",
          }),
          partida({
            id: "volta",
            rodada: 1,
            posicao: 1,
            perna: 2,
            nome_1: "Beto",
            nome_2: "Ana",
          }),
          partida({ id: "s2", rodada: 1, posicao: 2, nome_1: "Caio", nome_2: "Dani" }),
        ]}
      />
    )

    const semis = screen.getByRole("region", { name: "Semifinais" })
    expect(within(semis).getByText("Ida")).toBeInTheDocument()
    expect(within(semis).getByText("Volta")).toBeInTheDocument()
  })
})

describe("BracketView — campeão", () => {
  it("final encerrada exibe o banner 'Campeão: <nome>'", () => {
    // Chave de 2 (uma posicao na fase 1) ⇒ a fase 1 JÁ é a final. Encerrada
    // 3x1: Ana é a campeã.
    render(
      <BracketView
        partidas={[
          partida({
            id: "final",
            rodada: 1,
            posicao: 1,
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 3,
            placar_2: 1,
            status: "encerrada",
          }),
        ]}
      />
    )

    expect(screen.getByText(/Campeão: Ana/)).toBeInTheDocument()
  })

  it("final em aberto não exibe banner de campeão", () => {
    render(
      <BracketView
        partidas={[
          partida({
            id: "final",
            rodada: 1,
            posicao: 1,
            nome_1: "Ana",
            nome_2: "Beto",
            status: "em_andamento",
          }),
        ]}
      />
    )

    expect(screen.queryByText(/Campeão:/)).not.toBeInTheDocument()
  })
})

describe("BracketView — disputa de 3º lugar", () => {
  it("rotula o slot extra da rodada final (posicao 2) como 'Disputa de 3º lugar'", () => {
    // Chave de 4: semis na fase 1, final (posicao 1) e 3º lugar (posicao 2) na
    // fase 2. A view marca o 3º lugar via ehTerceiroLugar(fase, posicao, fases).
    render(
      <BracketView
        partidas={[
          partida({ id: "s1", rodada: 1, posicao: 1, nome_1: "Ana", nome_2: "Beto" }),
          partida({ id: "s2", rodada: 1, posicao: 2, nome_1: "Caio", nome_2: "Dani" }),
          partida({ id: "final", rodada: 2, posicao: 1, nome_1: "Ana", nome_2: "Caio" }),
          partida({
            id: "terceiro",
            rodada: 2,
            posicao: 2,
            nome_1: "Beto",
            nome_2: "Dani",
          }),
        ]}
      />
    )

    expect(screen.getByText("Disputa de 3º lugar")).toBeInTheDocument()
  })
})

describe("BracketView — destaque do vencedor", () => {
  it("aplica font-semibold no vencedor de confronto encerrado e não no perdedor", () => {
    // Final encerrada 2x0: Ana vence. O nome do vencedor recebe negrito; o do
    // perdedor não. Asserção pelo elemento de texto (LinhaLado renderiza o
    // nome num <span> com a classe condicional).
    render(
      <BracketView
        partidas={[
          partida({
            id: "final",
            rodada: 1,
            posicao: 1,
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 2,
            placar_2: 0,
            status: "encerrada",
          }),
        ]}
      />
    )

    // "Ana" aparece também no banner de campeão (sem o span de LinhaLado);
    // pegamos o nó cujo pai é a linha de placar do confronto (negrito).
    const vencedor = screen
      .getAllByText("Ana")
      .find((el) => el.className.includes("truncate"))
    const perdedor = screen
      .getAllByText("Beto")
      .find((el) => el.className.includes("truncate"))

    expect(vencedor).toBeDefined()
    expect(perdedor).toBeDefined()
    expect(vencedor).toHaveClass("font-semibold")
    expect(perdedor).not.toHaveClass("font-semibold")
  })
})
