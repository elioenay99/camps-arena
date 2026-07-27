// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Actions e toasts são efeitos externos — mockados para observar o wiring.
vi.mock("@/actions/postponement", () => ({
  adiarPartida: vi.fn(),
  desfazerAdiamento: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { AdiarButton, DesfazerAdiamentoButton } from "@/features/match/components/PostponeButtons"
import { adiarPartida, desfazerAdiamento } from "@/actions/postponement"
import { toast } from "sonner"

const mockAdiar = vi.mocked(adiarPartida)
const mockDesfazer = vi.mocked(desfazerAdiamento)
const mockToast = vi.mocked(toast)

const MATCH = "m1"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("AdiarButton", () => {
  it("começa fechado mostrando só 'Adiar'; abrir revela o campo de motivo", () => {
    render(<AdiarButton matchId={MATCH} />)
    expect(screen.getByRole("button", { name: "Adiar" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/motivo/i)).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Adiar" }))
    expect(screen.getByPlaceholderText(/motivo/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument()
  })

  it("confirmar sem motivo chama adiarPartida(matchId, undefined) e avisa sucesso", async () => {
    mockAdiar.mockResolvedValue({ ok: true })
    render(<AdiarButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
    await waitFor(() => expect(mockAdiar).toHaveBeenCalledWith(MATCH, undefined))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("confirmar com motivo passa o texto (trim) à action", async () => {
    mockAdiar.mockResolvedValue({ ok: true })
    render(<AdiarButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }))
    fireEvent.change(screen.getByPlaceholderText(/motivo/i), {
      target: { value: "  chuva forte  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
    await waitFor(() => expect(mockAdiar).toHaveBeenCalledWith(MATCH, "chuva forte"))
  })

  it("erro da action vira toast.error e mantém aberto", async () => {
    mockAdiar.mockResolvedValue({ ok: false, error: "Partidas de chave não podem ser adiadas." })
    render(<AdiarButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }))
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Partidas de chave não podem ser adiadas.")
    )
    expect(screen.getByRole("button", { name: "Confirmar" })).toBeInTheDocument()
  })

  it("cancelar volta ao estado fechado e limpa o motivo", () => {
    render(<AdiarButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: "Adiar" }))
    fireEvent.change(screen.getByPlaceholderText(/motivo/i), { target: { value: "x" } })
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByRole("button", { name: "Adiar" })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/motivo/i)).toBeNull()
  })
})

describe("DesfazerAdiamentoButton", () => {
  it("clique chama desfazerAdiamento(matchId) e avisa sucesso", async () => {
    mockDesfazer.mockResolvedValue({ ok: true })
    render(<DesfazerAdiamentoButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: /desfazer adiamento/i }))
    await waitFor(() => expect(mockDesfazer).toHaveBeenCalledWith(MATCH))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("erro vira toast.error", async () => {
    mockDesfazer.mockResolvedValue({ ok: false, error: "Esta partida não está adiada." })
    render(<DesfazerAdiamentoButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: /desfazer adiamento/i }))
    await waitFor(() =>
      expect(mockToast.error).toHaveBeenCalledWith("Esta partida não está adiada.")
    )
  })
})
