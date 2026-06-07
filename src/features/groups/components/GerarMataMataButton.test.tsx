// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// A action e os toasts são efeitos externos — mockados para observar o wiring.
vi.mock("@/actions/tournaments", () => ({
  gerarMataMataDosGrupos: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

import { GerarMataMataButton } from "@/features/groups/components/GerarMataMataButton"
import { gerarMataMataDosGrupos } from "@/actions/tournaments"
import { toast } from "sonner"

const mockAction = vi.mocked(gerarMataMataDosGrupos)
const mockToast = vi.mocked(toast)

const TOURNAMENT = "11111111-1111-4111-8111-111111111111"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("GerarMataMataButton — gate de pendências", () => {
  it("pendentes>0 desabilita o botão e mostra a contagem (UX antes da revalidação)", () => {
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={3} />)
    expect(screen.getByRole("button", { name: /gerar mata-mata/i })).toBeDisabled()
    expect(screen.getByText(/Faltam 3 jogos/)).toBeInTheDocument()
  })

  it("pendentes=1 usa singular ('Falta 1 jogo')", () => {
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={1} />)
    expect(screen.getByText(/Falta 1 jogo/)).toBeInTheDocument()
  })

  it("pendentes=0 habilita o botão e não exibe contagem", () => {
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={0} />)
    expect(screen.getByRole("button", { name: /gerar mata-mata/i })).toBeEnabled()
    expect(screen.queryByText(/jogos da fase de grupos/)).toBeNull()
  })
})

describe("GerarMataMataButton — clique chama a action e reage ao resultado", () => {
  it("clique invoca gerarMataMataDosGrupos com o tournamentId e avisa sucesso", async () => {
    mockAction.mockResolvedValue({ ok: true, sorteioUsado: false })
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={0} />)
    fireEvent.click(screen.getByRole("button", { name: /gerar mata-mata/i }))
    await waitFor(() => expect(mockAction).toHaveBeenCalledWith(TOURNAMENT))
    expect(mockToast.success).toHaveBeenCalled()
    // Sem sorteio na linha de corte → não há aviso de sorteio.
    expect(mockToast.warning).not.toHaveBeenCalled()
  })

  it("sorteioUsado=true dispara toast.warning de sorteio na linha de corte", async () => {
    mockAction.mockResolvedValue({ ok: true, sorteioUsado: true })
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={0} />)
    fireEvent.click(screen.getByRole("button", { name: /gerar mata-mata/i }))
    await waitFor(() => expect(mockToast.warning).toHaveBeenCalled())
    expect(mockToast.warning.mock.calls[0][0]).toMatch(/sorteio/i)
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("resultado de erro vira toast.error com a mensagem da action", async () => {
    mockAction.mockResolvedValue({ ok: false, error: "Algo deu errado" })
    render(<GerarMataMataButton tournamentId={TOURNAMENT} pendentes={0} />)
    fireEvent.click(screen.getByRole("button", { name: /gerar mata-mata/i }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Algo deu errado"))
    expect(mockToast.success).not.toHaveBeenCalled()
  })
})
