// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// As listas embutem o botão de lifecycle (client) — neutralizado no render.
vi.mock("@/actions/match", () => ({
  encerrarPartida: vi.fn(),
  reabrirPartida: vi.fn(),
}))
// Folhas client de W.O. chamam actions — neutralizadas no render (o foco aqui
// é o agrupamento por rodada e a presença dos controles por papel).
vi.mock("@/actions/wo", () => ({
  marcarWO: vi.fn(),
  solicitarWO: vi.fn(),
  responderWO: vi.fn(),
  fecharRodada: vi.fn(),
}))

import { MatchHistoryList } from "@/features/match/components/MatchHistoryList"
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList"
import type { PartidaAberta } from "@/features/standings/data/getTournamentClassificacao"

afterEach(cleanup)

/** Partida aberta competitiva (lados por vaga) com defaults sensatos. */
function abertaComp(over: Partial<PartidaAberta> = {}): PartidaAberta {
  return {
    id: "m1",
    nome_1: "Grêmio",
    nome_2: "Inter",
    placar_1: 0,
    placar_2: 0,
    status: "agendada",
    rodada: 1,
    perna: null,
    grupo: null,
    participante_1: null,
    participante_2: null,
    vagaId_1: "s1",
    vagaId_2: "s2",
    ...over,
  }
}

describe("rótulo de rodada nas listas de partidas", () => {
  it("OpenMatchesList mostra o rótulo da rodada no item (R{n}) e o texto acessível", () => {
    // Competitivo (com rodada) passa pelo passador, abrindo na rodada exibida.
    render(
      <OpenMatchesList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 2,
            perna: null,
            grupo: null,
            participante_1: null,
            participante_2: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R2")).toBeInTheDocument()
    expect(screen.getByText(/Rodada 2: Placar atual/)).toBeInTheDocument()
  })

  it("OpenMatchesList identifica a perna do confronto ida-e-volta", () => {
    render(
      <OpenMatchesList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 1,
            perna: 1,
            grupo: null,
            participante_1: null,
            participante_2: null,
          },
          {
            id: "m2",
            nome_1: "Beto",
            nome_2: "Ana",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: 1,
            perna: 2,
            grupo: null,
            participante_1: null,
            participante_2: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R1 ida")).toBeInTheDocument()
    expect(screen.getByText("R1 volta")).toBeInTheDocument()
    expect(screen.getByText(/Rodada 1 \(volta\): Placar atual/)).toBeInTheDocument()
  })

  it("MatchHistoryList mostra a rodada da encerrada quando presente", () => {
    render(
      <MatchHistoryList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 2,
            placar_2: 1,
            encerradaEm: "2026-06-04T12:00:00Z",
            rodada: 5,
            perna: null,
            grupo: null,
          },
          {
            id: "m2",
            nome_1: "Caio",
            nome_2: "Dani",
            placar_1: 0,
            placar_2: 3,
            encerradaEm: "2026-06-03T12:00:00Z",
            rodada: null,
            perna: null,
            grupo: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R5")).toBeInTheDocument()
    expect(screen.getByText(/Rodada 5: Placar final/)).toBeInTheDocument()
    // A avulsa segue sem rótulo.
    expect(screen.queryByText("R0")).toBeNull()
    expect(screen.getAllByText(/^R\d+$/u)).toHaveLength(1)
  })
})

describe("OpenMatchesList — passador por rodada + fechar rodada", () => {
  const TORNEIO = "11111111-1111-4111-8111-111111111111"

  it("competitivo entrega ao passador: uma rodada por vez (sem blocos empilhados)", () => {
    render(
      <OpenMatchesList
        partidas={[
          abertaComp({ id: "m1", rodada: 1 }),
          abertaComp({ id: "m2", rodada: 2, nome_1: "Bahia", nome_2: "Vitória" }),
        ]}
        rodadaAtiva={1}
      />
    )
    // Passador abre na rodada ATIVA (1): mostra Grêmio×Inter; a rodada 2 fica
    // oculta até navegar. Há um seletor de rodada e NÃO há mais cabeçalhos
    // "Rodada N" empilhados.
    expect(
      screen.getByRole("combobox", { name: "Ir para a rodada" })
    ).toBeInTheDocument()
    expect(screen.getByText("Grêmio")).toBeInTheDocument()
    expect(screen.queryByText("Bahia")).toBeNull()
    expect(screen.queryByRole("heading", { name: /Rodada \d/ })).toBeNull()
  })

  it("o botão 'Fechar rodada' aparece SÓ na rodada ativa e SÓ para o dono", () => {
    render(
      <OpenMatchesList
        partidas={[
          abertaComp({ id: "m1", rodada: 1 }),
          abertaComp({ id: "m2", rodada: 2 }),
        ]}
        mostrarEncerrar
        tournamentId={TORNEIO}
        rodadaAtiva={1}
      />
    )
    // Uma única instância (rodada ativa = 1).
    expect(screen.getAllByRole("button", { name: /fechar rodada/i })).toHaveLength(1)
  })

  it("não-dono não vê 'Fechar rodada'", () => {
    render(
      <OpenMatchesList
        partidas={[abertaComp({ rodada: 1 })]}
        tournamentId={TORNEIO}
        rodadaAtiva={1}
      />
    )
    expect(screen.queryByRole("button", { name: /fechar rodada/i })).toBeNull()
  })

  it("avulso (sem rodada) mantém lista plana, sem blocos nem fechar rodada", () => {
    render(
      <OpenMatchesList
        partidas={[
          {
            id: "m1",
            nome_1: "Ana",
            nome_2: "Beto",
            placar_1: 0,
            placar_2: 0,
            status: "agendada",
            rodada: null,
            perna: null,
            grupo: null,
            participante_1: null,
            participante_2: null,
          },
        ]}
        mostrarEncerrar
        tournamentId={TORNEIO}
      />
    )
    expect(screen.queryByRole("heading", { name: /Rodada/ })).toBeNull()
    expect(screen.queryByRole("button", { name: /fechar rodada/i })).toBeNull()
    // Partida avulsa (rodada null) renderiza sem rótulo de rodada.
    expect(screen.queryByText(/^R\d/u)).toBeNull()
    // Sem passador: o seletor de rodada não aparece.
    expect(screen.queryByRole("combobox", { name: "Ir para a rodada" })).toBeNull()
  })
})

describe("MatchHistoryList — rótulo de W.O.", () => {
  const encerradaWO = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    nome_1: "Grêmio",
    nome_2: "Inter",
    placar_1: 0,
    placar_2: 0,
    encerradaEm: "2026-06-07T12:00:00Z",
    rodada: 1,
    perna: null,
    grupo: null,
    wo: true,
    woVencedorLado: 1 as const,
    ...over,
  })

  it("exibe 'W.O.' em vez do placar 0x0 e descreve o vencedor", () => {
    render(<MatchHistoryList partidas={[encerradaWO()]} />)
    expect(screen.getByText("W.O.")).toBeInTheDocument()
    // Texto acessível nomeia o vencedor (lado 1 = Grêmio).
    expect(screen.getByText(/W\.O\. — Grêmio venceu/)).toBeInTheDocument()
    // Não mostra o placar 0x0.
    expect(screen.queryByText("0 x 0")).toBeNull()
  })

  it("partida normal segue mostrando o placar", () => {
    render(
      <MatchHistoryList
        partidas={[encerradaWO({ wo: false, woVencedorLado: null, placar_1: 2, placar_2: 1 })]}
      />
    )
    expect(screen.getByText("2 x 1")).toBeInTheDocument()
    expect(screen.queryByText("W.O.")).toBeNull()
  })
})

describe("OpenMatchesList — controles de W.O. por papel", () => {
  const EU = "22222222-2222-4222-8222-222222222222"

  it("dono vê 'W.O.' (marcar) nas partidas competitivas", () => {
    render(
      <OpenMatchesList partidas={[abertaComp()]} mostrarEncerrar rodadaAtiva={1} />
    )
    expect(screen.getByRole("button", { name: "W.O." })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Encerrar" })).toBeInTheDocument()
  })

  it("quem joga e NÃO é dono vê 'Solicitar W.O.'", () => {
    render(
      <OpenMatchesList
        partidas={[
          abertaComp({
            participante_1: { id: EU, celular: null },
            participante_2: { id: "rival", celular: null },
          }),
        ]}
        convocacao={{ userId: EU, titulo: "Copa", tournamentId: "t1" }}
      />
    )
    expect(screen.getByRole("button", { name: /solicitar w\.o\./i })).toBeInTheDocument()
    // Não-dono não marca W.O. direto.
    expect(screen.queryByRole("button", { name: "W.O." })).toBeNull()
  })

  it("clube órfão (vaga aberta) é sinalizado na partida", () => {
    render(
      <OpenMatchesList partidas={[abertaComp({ orfao_2: true })]} mostrarEncerrar rodadaAtiva={1} />
    )
    expect(screen.getByText(/vaga aberta/i)).toBeInTheDocument()
  })
})

describe("OpenMatchesList — atalho de convocação (re-engajamento)", () => {
  const TORNEIO = "11111111-1111-4111-8111-111111111111"
  const EU = "22222222-2222-4222-8222-222222222222"
  const RIVAL = "33333333-3333-4333-8333-333333333333"

  const partidaComLados = (over: Record<string, unknown> = {}) => ({
    id: "m1",
    nome_1: "Eu",
    nome_2: "Rival",
    placar_1: 0,
    placar_2: 0,
    status: "agendada" as const,
    rodada: null,
    perna: null,
    grupo: null,
    participante_1: { id: EU, celular: null },
    participante_2: { id: RIVAL, celular: "11912345678" },
    ...over,
  })

  it("participante vê 'Chamar' apontando ao adversário com a mensagem pronta", () => {
    const { container } = render(
      <OpenMatchesList
        partidas={[partidaComLados()]}
        convocacao={{ userId: EU, titulo: "Copa da Firma", tournamentId: TORNEIO }}
      />
    )
    const link = container.querySelector('a[href^="https://wa.me/5511912345678"]')
    expect(link).toBeInTheDocument()
    // Mensagem com contexto, codificada em ?text= (sauda o ADVERSÁRIO e
    // cita o torneio) — asserções por parte, sem cortar string no meio.
    const href = link?.getAttribute("href") ?? ""
    expect(href).toContain("?text=")
    expect(href).toContain(encodeURIComponent("Fala, Rival!"))
    expect(href).toContain(encodeURIComponent("Copa da Firma"))
  })

  it("quem NÃO joga a partida não vê o atalho (nem o celular no HTML)", () => {
    const { container } = render(
      <OpenMatchesList
        partidas={[partidaComLados()]}
        convocacao={{
          userId: "99999999-9999-4999-8999-999999999999",
          titulo: "Copa da Firma",
          tournamentId: TORNEIO,
        }}
      />
    )
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
    expect(container.innerHTML).not.toContain("11912345678")
  })

  it("sem a prop convocacao (visitante/sem sessão na superfície) nada renderiza", () => {
    const { container } = render(<OpenMatchesList partidas={[partidaComLados()]} />)
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })

  it("adversário sem celular válido não gera botão", () => {
    const { container } = render(
      <OpenMatchesList
        partidas={[
          partidaComLados({ participante_2: { id: RIVAL, celular: "123" } }),
        ]}
        convocacao={{ userId: EU, titulo: "Copa", tournamentId: TORNEIO }}
      />
    )
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })

  it("lado 'A definir' (participante nulo) com convocacao presente não gera botão", () => {
    const { container } = render(
      <OpenMatchesList
        partidas={[
          partidaComLados({ participante_2: null, nome_2: "A definir" }),
        ]}
        convocacao={{ userId: EU, titulo: "Copa", tournamentId: TORNEIO }}
      />
    )
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })

  it("funciona dos dois lados: participante_2 chama o participante_1", () => {
    const { container } = render(
      <OpenMatchesList
        partidas={[
          partidaComLados({
            participante_1: { id: RIVAL, celular: "11988887777" },
            participante_2: { id: EU, celular: null },
            nome_1: "Rival",
            nome_2: "Eu",
          }),
        ]}
        convocacao={{ userId: EU, titulo: "Copa", tournamentId: TORNEIO }}
      />
    )
    expect(
      container.querySelector('a[href^="https://wa.me/5511988887777"]')
    ).toBeInTheDocument()
  })
})

describe("contenção de PII — fronteira RSC (guard de regressão)", () => {
  it("OpenMatchesList e MatchCard permanecem Server Components", async () => {
    // A contenção do celular depende de estas superfícies serem RSC: props
    // não-renderizadas de Server Component NÃO entram no payload Flight.
    // Se alguém adicionar "use client", os celulares de TODOS os lados de
    // partidasAbertas vazariam ao browser — este guard falha ANTES disso.
    const fs = await import("node:fs/promises")
    for (const arquivo of [
      "src/features/match/components/OpenMatchesList.tsx",
      "src/features/match/components/MatchCard.tsx",
    ]) {
      const fonte = await fs.readFile(arquivo, "utf8")
      expect(fonte, `${arquivo} não pode virar client component`).not.toMatch(
        /^\s*["']use client["']/m
      )
    }
  })
})
