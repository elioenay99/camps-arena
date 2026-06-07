// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// O modal embute busca de clube (action) e toasts — neutralizados: o alvo é
// a fiação POR COLUNA do atalho wa.me (cenário do delta match-score-modal).
vi.mock("@/actions/teams", () => ({
  searchTeams: vi.fn(),
  selectTeam: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { MatchScoreModal } from "@/features/match/components/MatchScoreModal"

afterEach(cleanup)

describe("MatchScoreModal — atalho wa.me com mensagem POR COLUNA", () => {
  it("cada coluna abre o chat do PRÓPRIO lado com a SUA mensagem (sem cross-wiring)", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Copa da Firma • em andamento"
        descricao="Ana enfrenta Beto"
        participante1={{
          nome: "Ana",
          celular: "11911111111",
          mensagemWhatsApp: "Fala, Ana! Bora?",
        }}
        participante2={{
          nome: "Beto",
          celular: "11922222222",
          mensagemWhatsApp: "Fala, Beto! Bora?",
        }}
      />
    )
    fireEvent.click(screen.getByRole("button"))

    const linkAna = screen.getByRole("link", { name: /Chamar Ana/ })
    const linkBeto = screen.getByRole("link", { name: /Chamar Beto/ })
    // Número E mensagem do lado certo — um swap de fiação trocaria a saudação.
    expect(linkAna).toHaveAttribute(
      "href",
      `https://wa.me/5511911111111?text=${encodeURIComponent("Fala, Ana! Bora?")}`
    )
    expect(linkBeto).toHaveAttribute(
      "href",
      `https://wa.me/5511922222222?text=${encodeURIComponent("Fala, Beto! Bora?")}`
    )
  })

  it("sem mensagemWhatsApp o chat abre vazio (compat com o uso demo)", () => {
    render(
      <MatchScoreModal
        matchId="m1"
        tituloPartida="Ana x Beto"
        subtitulo="Demo"
        descricao="Ana enfrenta Beto"
        participante1={{ nome: "Ana", celular: "11911111111" }}
        participante2={{ nome: "Beto", celular: null }}
      />
    )
    fireEvent.click(screen.getByRole("button"))
    const linkAna = screen.getByRole("link", { name: /Chamar Ana/ })
    expect(linkAna.getAttribute("href")).toBe("https://wa.me/5511911111111")
    // Sem celular válido a coluna não tem botão.
    expect(screen.queryByRole("link", { name: /Chamar Beto/ })).toBeNull()
  })
})
