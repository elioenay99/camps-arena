// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// As listas embutem o botão de lifecycle (client) — neutralizado no render.
vi.mock("@/actions/match", () => ({
  encerrarPartida: vi.fn(),
  reabrirPartida: vi.fn(),
}))

import { MatchHistoryList } from "@/features/match/components/MatchHistoryList"
import { OpenMatchesList } from "@/features/match/components/OpenMatchesList"

afterEach(cleanup)

describe("rótulo de rodada nas listas de partidas", () => {
  it("OpenMatchesList mostra a rodada quando presente e omite quando nula", () => {
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
          {
            id: "m2",
            nome_1: "Caio",
            nome_2: "Dani",
            placar_1: 1,
            placar_2: 1,
            status: "em_andamento",
            rodada: null,
            perna: null,
            grupo: null,
            participante_1: null,
            participante_2: null,
          },
        ]}
      />
    )
    expect(screen.getByText("R2")).toBeInTheDocument()
    // Partida avulsa (rodada null) renderiza sem rótulo — como sempre.
    expect(screen.queryByText(/^R\d+$/u)?.textContent).toBe("R2")
    // E o texto acessível identifica a rodada.
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
