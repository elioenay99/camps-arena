// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

describe("BracketView — chave sem partidas (crash-proof)", () => {
  it("com partidas=[] renderiza o estado gracioso sem lançar (regressão do 500)", () => {
    // Grande final SPLIT montada e não gerada → getGrandeFinal retorna
    // `partidas: []`. Antes do fix, rodadaBaseDaChave/tamanhoChaveDasPartidas
    // lançavam "Chave sem partidas geradas." no topo do componente e derrubavam
    // o render inteiro da página da liga (500). O componente puro NÃO pode crashar
    // por uma entrada válida-porém-vazia.
    expect(() => render(<BracketView partidas={[]} />)).not.toThrow()
    expect(screen.getByText("A chave ainda não foi gerada.")).toBeInTheDocument()
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

describe("BracketView — celebração ativa do título", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    )
  })
  afterEach(() => vi.unstubAllGlobals())

  const finalDecidida = () =>
    partida({
      id: "final",
      rodada: 1,
      posicao: 1,
      nome_1: "Ana",
      nome_2: "Beto",
      placar_1: 3,
      placar_2: 1,
      status: "encerrada",
    })

  it("celebrarCampeao + cor + campeão ⇒ dispara o confete", () => {
    render(
      <BracketView partidas={[finalDecidida()]} cor="#bd93f9" celebrarCampeao />
    )
    expect(screen.getByTestId("celebracao-confete")).toBeInTheDocument()
  })

  it("celebrarCampeao=false (playoff/playout/barragem) NÃO celebra, mesmo com cor", () => {
    render(<BracketView partidas={[finalDecidida()]} cor="#bd93f9" />)
    expect(screen.queryByTestId("celebracao-confete")).not.toBeInTheDocument()
    // o banner de campeão do bracket continua (só o confete é gated).
    expect(screen.getByText(/Campeão: Ana/)).toBeInTheDocument()
  })

  it("sem cor não celebra mesmo com o flag", () => {
    render(<BracketView partidas={[finalDecidida()]} celebrarCampeao />)
    expect(screen.queryByTestId("celebracao-confete")).not.toBeInTheDocument()
  })

  it("final ainda em aberto não celebra", () => {
    render(
      <BracketView
        partidas={[
          partida({ id: "final", rodada: 1, posicao: 1, status: "em_andamento" }),
        ]}
        cor="#bd93f9"
        celebrarCampeao
      />
    )
    expect(screen.queryByTestId("celebracao-confete")).not.toBeInTheDocument()
  })
})

describe("BracketView — W.O. decide o confronto", () => {
  it("final por W.O. (0x0) consagra o campeão pelo woVencedor, não pelo placar", () => {
    // Sem o tratamento de W.O., o 0x0 viraria empate → sem campeão. Com ele,
    // o woVencedor (p1 = Ana) é o campeão.
    render(
      <BracketView
        partidas={[
          partida({
            id: "final",
            rodada: 1,
            posicao: 1,
            participante_1: "p1",
            participante_2: "p2",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            wo: true,
            woVencedor: "p1",
          }),
        ]}
      />
    )
    expect(screen.getByText(/Campeão: Ana/)).toBeInTheDocument()
    // O card sinaliza o W.O.
    expect(screen.getByText("W.O.")).toBeInTheDocument()
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

describe("BracketView — rodada-base (chave após fase de grupos)", () => {
  it("chave de 4 começando na rodada 4 rotula 'Semifinais'/'Final' pela fase RELATIVA e destaca o campeão", () => {
    // Pós-grupos: a chave não começa na rodada 1. Semis em rodada 4, final em
    // rodada 5. A view deriva a rodada-base (4) e trabalha com fases relativas
    // (semis = fase 1, final = fase 2) — os rótulos são os mesmos do mata-mata
    // puro. Final encerrada 2x1 ⇒ banner do campeão.
    render(
      <BracketView
        partidas={[
          partida({ id: "s1", rodada: 4, posicao: 1, nome_1: "Ana", nome_2: "Beto" }),
          partida({ id: "s2", rodada: 4, posicao: 2, nome_1: "Caio", nome_2: "Dani" }),
          partida({
            id: "final",
            rodada: 5,
            posicao: 1,
            nome_1: "Ana",
            nome_2: "Caio",
            placar_1: 2,
            placar_2: 1,
            status: "encerrada",
          }),
        ]}
      />
    )

    expect(screen.getByRole("heading", { name: "Semifinais" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Final" })).toBeInTheDocument()
    expect(screen.getByText(/Campeão: Ana/)).toBeInTheDocument()
  })

  it("chave de 4 em base != 1 com a final ainda não gerada mostra a coluna Final como placeholder", () => {
    // Só as semis (rodada 4) existem. A coluna Final (fase relativa 2) vem do
    // nº de fases derivado do tamanho, não das partidas: existe mesmo vazia, e
    // o slot futuro é "A definir".
    render(
      <BracketView
        partidas={[
          partida({ id: "s1", rodada: 4, posicao: 1, nome_1: "Ana", nome_2: "Beto" }),
          partida({ id: "s2", rodada: 4, posicao: 2, nome_1: "Caio", nome_2: "Dani" }),
        ]}
      />
    )

    expect(screen.getByRole("heading", { name: "Semifinais" })).toBeInTheDocument()
    const final = screen.getByRole("region", { name: "Final" })
    expect(within(final).getAllByText("A definir")).toHaveLength(2)
  })
})

describe("BracketView — destaque do vencedor", () => {
  it("aplica text-primary font-semibold no vencedor de confronto encerrado e não no perdedor", () => {
    // Final encerrada 2x0: Ana vence. O lado do vencedor recebe destaque
    // (verde + negrito); o do perdedor não. O wrapper do lado (que envolve
    // troféu + nome) carrega a classe condicional; o nome fica num <span
    // class="truncate"> filho.
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
    // pegamos o nó cujo pai é o wrapper do lado (que tem o destaque).
    const vencedorNome = screen
      .getAllByText("Ana")
      .find((el) => el.className.includes("truncate"))
    const perdedorNome = screen
      .getAllByText("Beto")
      .find((el) => el.className.includes("truncate"))

    expect(vencedorNome).toBeDefined()
    expect(perdedorNome).toBeDefined()
    // O destaque cromático vive no wrapper (pai do nome), não no <span truncate>.
    expect(vencedorNome?.parentElement).toHaveClass("text-primary", "font-semibold")
    expect(perdedorNome?.parentElement).not.toHaveClass("font-semibold")
    expect(perdedorNome?.parentElement).not.toHaveClass("text-primary")
  })

  it("anuncia o lado que avançou de forma NÃO-cromática (sr-only 'vencedor') só no vencedor", () => {
    // WCAG 1.4.1 (uso de cor): a cor é só reforço. Final encerrada 2x0 — Ana
    // vence — deve emitir UM marcador textual para leitor de tela ("vencedor");
    // o troféu é decorativo (aria-hidden). O perdedor não recebe nada.
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

    // Exatamente um lado é anunciado como vencedor (o de Ana).
    const marcadores = screen.getAllByText("vencedor")
    expect(marcadores).toHaveLength(1)
  })

  it("ida-e-volta ENCERRADA anuncia o vencedor do agregado UMA vez (não por perna)", () => {
    // Regressão de a11y: o marcador 'vencedor' saía 1x por PERNA → 2x para o
    // mesmo competidor no confronto de 2 jogos. Deve sair UMA vez por confronto.
    render(
      <BracketView
        partidas={[
          partida({
            id: "ida",
            perna: 1,
            participante_1: "ana",
            participante_2: "beto",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 2,
            placar_2: 0,
            status: "encerrada",
          }),
          partida({
            id: "volta",
            perna: 2,
            participante_1: "beto",
            participante_2: "ana",
            nome_1: "Beto",
            nome_2: "Ana",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
          }),
        ]}
      />
    )

    // Ana vence o agregado (2x0) — anunciada UMA vez, apesar das duas pernas.
    expect(screen.getAllByText("vencedor")).toHaveLength(1)
  })

  it("vencedor por W.O. (0x0) — placar não desambigua — ainda é anunciado ao leitor de tela", () => {
    // O caso que a cor sozinha quebrava: placar 0x0 não diz quem avançou. O
    // marcador sr-only 'vencedor' deixa o desfecho legível sem depender de cor.
    render(
      <BracketView
        partidas={[
          partida({
            id: "final",
            rodada: 1,
            posicao: 1,
            participante_1: "p1",
            participante_2: "p2",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "encerrada",
            wo: true,
            woVencedor: "p1",
          }),
        ]}
      />
    )

    expect(screen.getByText("vencedor")).toBeInTheDocument()
  })

  it("confronto em aberto não anuncia vencedor", () => {
    // Sem desfecho não há lado que avançou: nenhum marcador/ícone de vencedor.
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

    expect(screen.queryByText("vencedor")).not.toBeInTheDocument()
  })
})
