// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Deps neutralizadas — o alvo é a ÂNCORA de ajuda "Barragem" no wizard e o nome
// acessível do radiogroup (não a submissão).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))
vi.mock("@/actions/leaguePyramid", () => ({ createCompetition: vi.fn() }))
vi.mock("@/actions/teams", () => ({ selectTeam: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { LeagueWizard } from "@/features/league/components/LeagueWizard"

afterEach(cleanup)

describe("LeagueWizard — âncora Barragem sem poluir o nome do grupo", () => {
  it("expõe o gatilho de ajuda, mas o radiogroup se chama só 'Estilo da barragem'", () => {
    render(<LeagueWizard />)

    // Passo "preset": escolher um preset + nomear (≥2 chars) libera "Próximo".
    fireEvent.click(screen.getByRole("button", { name: /Brasileirão/ }))
    fireEvent.change(screen.getByPlaceholderText("Ex.: Pirâmide da Várzea"), {
      target: { value: "Teste" },
    })
    fireEvent.click(screen.getByRole("button", { name: /Próximo/ }))

    // Passo "divisões" (nomes já semeados pelo preset) → avança p/ fronteiras.
    fireEvent.click(screen.getByRole("button", { name: /Próximo/ }))

    // Trocar o modo da fronteira para barragem cruzada revela o fieldset.
    fireEvent.change(screen.getByLabelText("Como decide o sobe/cai"), {
      target: { value: "barragem_cruzada" },
    })

    // O gatilho de ajuda existe...
    expect(
      screen.getByRole("button", { name: "O que é Barragem?" })
    ).toBeInTheDocument()
    // ...mas o NOME ACESSÍVEL do radiogroup é exatamente "Estilo da barragem"
    // (aria-labelledby aponta só o <span>, excluindo o botão de ajuda).
    expect(
      screen.getByRole("group", { name: "Estilo da barragem" })
    ).toBeInTheDocument()
  })
})
