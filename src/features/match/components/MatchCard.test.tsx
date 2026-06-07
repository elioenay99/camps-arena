// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// O card embute o modal conectado (client, importa Server Actions) e o
// TeamCrest (next/image) — neutralizados: o alvo é o ATALHO do card.
vi.mock("@/features/match/components/MatchScoreModalConnected", () => ({
  MatchScoreModalConnected: () => null,
}))
vi.mock("@/features/team/components/TeamCrest", () => ({
  TeamCrest: () => null,
}))

import { MatchCard } from "@/features/match/components/MatchCard"
import type { PartidaAtiva } from "@/features/match/data/getActiveMatches"

afterEach(cleanup)

const EU = "22222222-2222-4222-8222-222222222222"
const RIVAL = "33333333-3333-4333-8333-333333333333"

function partida(over: Partial<PartidaAtiva> = {}): PartidaAtiva {
  return {
    id: "m1",
    placar_1: 0,
    placar_2: 0,
    status: "em_andamento",
    created_at: "2026-06-07T12:00:00Z",
    tournament: {
      id: "11111111-1111-4111-8111-111111111111",
      titulo: "Copa da Firma",
      status: "ativo",
    },
    participante_1: { id: EU, nome: "Eu", avatar: null, celular: null },
    participante_2: { id: RIVAL, nome: "Rival", avatar: null, celular: "11912345678" },
    time_1: null,
    time_2: null,
    ...over,
  }
}

describe("MatchCard — atalho de convocação direto no card", () => {
  it("participante vê 'Chamar Rival' apontando ao adversário com mensagem pronta", () => {
    const { container } = render(<MatchCard partida={partida()} userId={EU} />)
    const link = container.querySelector('a[href^="https://wa.me/5511912345678"]')
    expect(link).toBeInTheDocument()
    expect(link).toHaveTextContent(/Chamar Rival/)
    // A mensagem sauda o ADVERSÁRIO e cita o torneio (?text= codificado).
    expect(link?.getAttribute("href")).toContain(
      encodeURIComponent("Fala, Rival!").slice(0, 20)
    )
  })

  it("quem não joga a partida não vê o atalho nem o celular no HTML do card", () => {
    const { container } = render(
      <MatchCard
        partida={partida()}
        userId="99999999-9999-4999-8999-999999999999"
      />
    )
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
    // RSC: o celular do adversário não vaza fora do href do participante.
    // (O modal conectado está mockado — em produção o tráfego do modal é o
    // risco aceito pré-existente; o CARD não adiciona nada.)
    expect(container.innerHTML).not.toContain("11912345678")
  })

  it("sem userId (compat) o card não mostra atalho", () => {
    const { container } = render(<MatchCard partida={partida()} />)
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })

  it("adversário sem celular não gera botão", () => {
    const { container } = render(
      <MatchCard
        partida={partida({
          participante_2: { id: RIVAL, nome: "Rival", avatar: null, celular: null },
        })}
        userId={EU}
      />
    )
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })
})
