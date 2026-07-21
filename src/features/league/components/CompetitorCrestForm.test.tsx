// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/actions/escudoCompetidor", () => ({
  definirEscudoCompetidor: vi.fn(),
  removerEscudoCompetidor: vi.fn(),
}))
// jsdom não tem canvas: a redução é testada pelo contrato, não pelo pixel.
vi.mock("@/lib/imagemCliente", () => ({ reduzirParaEscudo: vi.fn() }))

import {
  definirEscudoCompetidor,
  removerEscudoCompetidor,
} from "@/actions/escudoCompetidor"
import { CompetitorCrestForm } from "@/features/league/components/CompetitorCrestForm"
import { reduzirParaEscudo } from "@/lib/imagemCliente"
import { toast } from "sonner"

const mockDefinir = vi.mocked(definirEscudoCompetidor)
const mockRemover = vi.mocked(removerEscudoCompetidor)
const mockReduzir = vi.mocked(reduzirParaEscudo)

const COMPETITOR = "11111111-1111-4111-8111-111111111111"
const SEASON = "22222222-2222-4222-8222-222222222222"

function montar(props: Partial<Parameters<typeof CompetitorCrestForm>[0]> = {}) {
  return render(
    <CompetitorCrestForm
      competitorId={COMPETITOR}
      seasonId={SEASON}
      nome="Galo"
      escudoUrl={null}
      temEscudoProprio={false}
      {...props}
    />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  URL.createObjectURL = vi.fn(() => "blob:preview")
  URL.revokeObjectURL = vi.fn()
})

afterEach(cleanup)

describe("CompetitorCrestForm", () => {
  it("sem override: mostra 'Escudo do catálogo' e NÃO oferece remover", () => {
    montar()
    expect(screen.getByText("Escudo do catálogo")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Remover escudo/ })).not.toBeInTheDocument()
  })

  it("com override: mostra 'Escudo próprio desta liga' e oferece remover", () => {
    montar({ temEscudoProprio: true, escudoUrl: "https://cdn/x.png" })
    expect(screen.getByText("Escudo próprio desta liga")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Remover escudo de Galo" })
    ).toBeInTheDocument()
  })

  it("reduz a imagem antes de enviar e manda o seasonId no FormData", async () => {
    const reduzida = new File(["x"], "escudo.webp", { type: "image/webp" })
    mockReduzir.mockResolvedValue({ ok: true, file: reduzida })
    mockDefinir.mockResolvedValue({ ok: true, escudoUrl: "https://cdn/novo.webp" })

    const { container } = montar()
    const input = container.querySelector("input[type=file]") as HTMLInputElement
    await userEvent.upload(input, new File(["orig"], "foto.jpg", { type: "image/jpeg" }))

    await waitFor(() => expect(mockDefinir).toHaveBeenCalled())
    expect(mockReduzir).toHaveBeenCalled()
    const [id, fd] = mockDefinir.mock.calls[0]
    expect(id).toBe(COMPETITOR)
    expect(fd.get("seasonId")).toBe(SEASON)
    expect(fd.get("escudo")).toBe(reduzida)
    expect(toast.success).toHaveBeenCalledWith("Escudo atualizado.")
  })

  it("redução recusada: não chama a action e avisa o usuário", async () => {
    mockReduzir.mockResolvedValue({ ok: false, error: "Use uma imagem PNG, JPG ou WEBP." })

    const { container } = montar()
    const input = container.querySelector("input[type=file]") as HTMLInputElement
    // SVG passa pelo `accept="image/*"` do input, mas a redução o recusa.
    await userEvent.upload(input, new File(["<svg/>"], "a.svg", { type: "image/svg+xml" }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Use uma imagem PNG, JPG ou WEBP.")
    )
    expect(mockDefinir).not.toHaveBeenCalled()
  })

  it("remover chama a action com competidor e temporada", async () => {
    mockRemover.mockResolvedValue({ ok: true, escudoUrl: null })
    montar({ temEscudoProprio: true })

    await userEvent.click(screen.getByRole("button", { name: "Remover escudo de Galo" }))

    await waitFor(() => expect(mockRemover).toHaveBeenCalledWith(COMPETITOR, SEASON))
    expect(toast.success).toHaveBeenCalledWith("Escudo removido.")
  })
})
