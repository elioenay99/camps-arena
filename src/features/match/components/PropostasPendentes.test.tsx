// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Actions e toasts são efeitos externos — mockados para observar o wiring.
vi.mock("@/actions/scoreProposals", () => ({
  aprovarPropostaPlacar: vi.fn(),
  rejeitarPropostaPlacar: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { aprovarPropostaPlacar, rejeitarPropostaPlacar } from "@/actions/scoreProposals"
import { PropostasPendentes } from "@/features/match/components/PropostasPendentes"
import type { PropostaPendente } from "@/features/match/data/getPropostasPendentes"
import { toast } from "sonner"

const mockAprovar = vi.mocked(aprovarPropostaPlacar)
const mockRejeitar = vi.mocked(rejeitarPropostaPlacar)
const mockToast = vi.mocked(toast)

const TORNEIO = "11111111-1111-4111-8111-111111111111"

function proposta(over: Partial<PropostaPendente> = {}): PropostaPendente {
  return {
    id: "p1",
    matchId: "m1",
    placar_1: 2,
    placar_2: 1,
    lado1: "Grêmio",
    lado2: "Internacional",
    ...over,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("PropostasPendentes", () => {
  it("renderiza o placar com os lados de cada proposta", () => {
    render(
      <PropostasPendentes
        tournamentId={TORNEIO}
        propostas={[
          proposta(),
          proposta({ id: "p2", placar_1: 0, placar_2: 3, lado1: "Bahia", lado2: "Vitória" }),
        ]}
      />
    )
    expect(screen.getByText("Grêmio 2 x 1 Internacional")).toBeInTheDocument()
    expect(screen.getByText("Bahia 0 x 3 Vitória")).toBeInTheDocument()
  })

  it("o link da foto aponta para a rota assinada (nova aba, sem opener)", () => {
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)
    const link = screen.getByRole("link", { name: /ver foto/i })
    expect(link).toHaveAttribute(
      "href",
      `/dashboard/torneios/${TORNEIO}/evidencia/placar/p1`
    )
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("clicar Aprovar chama aprovarPropostaPlacar com o id e avisa sucesso", async () => {
    mockAprovar.mockResolvedValue({ ok: true })
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)
    fireEvent.click(screen.getByRole("button", { name: /aprovar/i }))
    await waitFor(() => expect(mockAprovar).toHaveBeenCalledWith("p1"))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("o fluxo Rejeitar chama rejeitarPropostaPlacar com { proposalId, motivo }", async () => {
    mockRejeitar.mockResolvedValue({ ok: true })
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)

    // Abre o campo de motivo, preenche e confirma.
    fireEvent.click(screen.getByRole("button", { name: /^rejeitar/i }))
    fireEvent.change(screen.getByLabelText(/motivo da rejeição/i), {
      target: { value: "Foto ilegível" },
    })
    fireEvent.click(screen.getByRole("button", { name: /confirmar rejeição/i }))

    await waitFor(() =>
      expect(mockRejeitar).toHaveBeenCalledWith({ proposalId: "p1", motivo: "Foto ilegível" })
    )
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("rejeitar sem motivo envia motivo undefined", async () => {
    mockRejeitar.mockResolvedValue({ ok: true })
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)
    fireEvent.click(screen.getByRole("button", { name: /^rejeitar/i }))
    fireEvent.click(screen.getByRole("button", { name: /confirmar rejeição/i }))
    await waitFor(() =>
      expect(mockRejeitar).toHaveBeenCalledWith({ proposalId: "p1", motivo: undefined })
    )
  })

  it("erro da action vira toast.error (aprovar)", async () => {
    mockAprovar.mockResolvedValue({ ok: false, error: "Você não pode aprovar." })
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)
    fireEvent.click(screen.getByRole("button", { name: /aprovar/i }))
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Você não pode aprovar.")
    )
  })

  it("erro da action vira toast.error (rejeitar)", async () => {
    mockRejeitar.mockResolvedValue({ ok: false, error: "Proposta já resolvida." })
    render(<PropostasPendentes tournamentId={TORNEIO} propostas={[proposta()]} />)
    fireEvent.click(screen.getByRole("button", { name: /^rejeitar/i }))
    fireEvent.click(screen.getByRole("button", { name: /confirmar rejeição/i }))
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Proposta já resolvida.")
    )
  })

  it("ações de propostas diferentes carregam o id correto", async () => {
    mockAprovar.mockResolvedValue({ ok: true })
    render(
      <PropostasPendentes
        tournamentId={TORNEIO}
        propostas={[proposta(), proposta({ id: "p2" })]}
      />
    )
    const itens = screen.getAllByRole("listitem")
    fireEvent.click(within(itens[1]).getByRole("button", { name: /aprovar/i }))
    await waitFor(() => expect(mockAprovar).toHaveBeenCalledWith("p2"))
  })
})
