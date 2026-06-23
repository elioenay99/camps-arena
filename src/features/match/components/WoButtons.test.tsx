// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Actions e toasts são efeitos externos — mockados para observar o wiring.
vi.mock("@/actions/wo", () => ({
  marcarWO: vi.fn(),
  solicitarWO: vi.fn(),
  responderWO: vi.fn(),
  fecharRodada: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import {
  FecharRodadaButton,
  MarcarWoButton,
  ResponderWoButtons,
  SolicitarWoButton,
} from "@/features/match/components/WoButtons"
import { fecharRodada, marcarWO, responderWO, solicitarWO } from "@/actions/wo"
import { toast } from "sonner"

const mockMarcar = vi.mocked(marcarWO)
const mockSolicitar = vi.mocked(solicitarWO)
const mockResponder = vi.mocked(responderWO)
const mockFechar = vi.mocked(fecharRodada)
const mockToast = vi.mocked(toast)

const MATCH = "m1"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("MarcarWoButton", () => {
  it("começa fechado mostrando só 'W.O.'; abrir revela os dois clubes", () => {
    render(
      <MarcarWoButton matchId={MATCH} nome1="Grêmio" nome2="Inter" vagaId1="s1" vagaId2="s2" />
    )
    expect(screen.getByRole("button", { name: "W.O." })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Grêmio" })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "W.O." }))
    expect(screen.getByText(/Vitória de:/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Grêmio" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Inter" })).toBeInTheDocument()
  })

  it("escolher o clube chama marcarWO com o slot daquele lado", async () => {
    mockMarcar.mockResolvedValue({ ok: true })
    render(
      <MarcarWoButton matchId={MATCH} nome1="Grêmio" nome2="Inter" vagaId1="s1" vagaId2="s2" />
    )
    fireEvent.click(screen.getByRole("button", { name: "W.O." }))
    fireEvent.click(screen.getByRole("button", { name: "Inter" }))
    await waitFor(() => expect(mockMarcar).toHaveBeenCalledWith(MATCH, "s2"))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("erro da action vira toast.error e mantém aberto", async () => {
    mockMarcar.mockResolvedValue({ ok: false, error: "Falhou" })
    render(
      <MarcarWoButton matchId={MATCH} nome1="Grêmio" nome2="Inter" vagaId1="s1" vagaId2="s2" />
    )
    fireEvent.click(screen.getByRole("button", { name: "W.O." }))
    fireEvent.click(screen.getByRole("button", { name: "Grêmio" }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Falhou"))
    expect(mockMarcar).toHaveBeenCalledWith(MATCH, "s1")
  })

  it("cancelar volta ao estado fechado", () => {
    render(
      <MarcarWoButton matchId={MATCH} nome1="Grêmio" nome2="Inter" vagaId1="s1" vagaId2="s2" />
    )
    fireEvent.click(screen.getByRole("button", { name: "W.O." }))
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }))
    expect(screen.getByRole("button", { name: "W.O." })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Grêmio" })).toBeNull()
  })
})

describe("SolicitarWoButton", () => {
  it("clique sem foto chama solicitarWO(matchId, null) e avisa sucesso", async () => {
    mockSolicitar.mockResolvedValue({ ok: true })
    render(<SolicitarWoButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: /solicitar w\.o\./i }))
    await waitFor(() => expect(mockSolicitar).toHaveBeenCalledWith(MATCH, null))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("seleciona uma foto e a passa à action", async () => {
    mockSolicitar.mockResolvedValue({ ok: true })
    const { container } = render(<SolicitarWoButton matchId={MATCH} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const foto = new File(["x"], "evidencia.webp", { type: "image/webp" })
    fireEvent.change(input, { target: { files: [foto] } })
    fireEvent.click(screen.getByRole("button", { name: /solicitar w\.o\./i }))
    await waitFor(() => expect(mockSolicitar).toHaveBeenCalledWith(MATCH, foto))
  })

  it("input de foto aceita só PNG/JPEG/WEBP", () => {
    const { container } = render(<SolicitarWoButton matchId={MATCH} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.getAttribute("accept")).toBe("image/png,image/jpeg,image/webp")
  })

  it("erro vira toast.error", async () => {
    mockSolicitar.mockResolvedValue({ ok: false, error: "Já pendente" })
    render(<SolicitarWoButton matchId={MATCH} />)
    fireEvent.click(screen.getByRole("button", { name: /solicitar w\.o\./i }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Já pendente"))
  })
})

describe("FecharRodadaButton", () => {
  it("clique chama fecharRodada com torneio + rodada e relata os W.O.", async () => {
    mockFechar.mockResolvedValue({ ok: true, marcadas: 2 })
    render(<FecharRodadaButton tournamentId="t1" rodada={3} />)
    fireEvent.click(screen.getByRole("button", { name: /fechar rodada/i }))
    await waitFor(() => expect(mockFechar).toHaveBeenCalledWith("t1", 3))
    expect(mockToast.success.mock.calls[0][0]).toMatch(/2 W\.O\./)
  })

  it("nenhuma órfã: mensagem de sucesso sem contagem", async () => {
    mockFechar.mockResolvedValue({ ok: true, marcadas: 0 })
    render(<FecharRodadaButton tournamentId="t1" rodada={1} />)
    fireEvent.click(screen.getByRole("button", { name: /fechar rodada/i }))
    await waitFor(() => expect(mockToast.success).toHaveBeenCalled())
    expect(mockToast.success.mock.calls[0][0]).toMatch(/nenhuma partida órfã/i)
  })
})

describe("ResponderWoButtons", () => {
  it("aceitar chama responderWO(id, true)", async () => {
    mockResponder.mockResolvedValue({ ok: true })
    render(<ResponderWoButtons requestId="r1" />)
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }))
    await waitFor(() => expect(mockResponder).toHaveBeenCalledWith("r1", true))
    expect(mockToast.success).toHaveBeenCalled()
  })

  it("recusar chama responderWO(id, false)", async () => {
    mockResponder.mockResolvedValue({ ok: true })
    render(<ResponderWoButtons requestId="r1" />)
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }))
    await waitFor(() => expect(mockResponder).toHaveBeenCalledWith("r1", false))
  })

  it("erro vira toast.error", async () => {
    mockResponder.mockResolvedValue({ ok: false, error: "Já resolvida" })
    render(<ResponderWoButtons requestId="r1" />)
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }))
    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith("Já resolvida"))
  })
})
