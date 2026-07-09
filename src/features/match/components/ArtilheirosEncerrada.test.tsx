// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/actions/matchGoals", () => ({ registrarAutoresLado: vi.fn() }))

import { toast } from "sonner"

import { registrarAutoresLado } from "@/actions/matchGoals"
import {
  ArtilheirosEncerrada,
  type LadoEditavel,
} from "@/features/match/components/ArtilheirosEncerrada"

const mockRegistrar = vi.mocked(registrarAutoresLado)
const mockToastSuccess = vi.mocked(toast.success)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ArtilheirosEncerrada — modo append (técnico)", () => {
  const ladoTecnico: LadoEditavel[] = [
    {
      lado: 1,
      nomeLado: "Time A",
      placar: 4,
      existentes: [{ jogador: "Vini", gols: 2, contra: false }],
    },
  ]

  it("submete APENAS o DELTA (as entradas novas), nunca reenvia o existente pré-carregado", async () => {
    mockRegistrar.mockResolvedValue({ ok: true, total: 3 })
    render(
      <ArtilheirosEncerrada
        matchId="m1"
        modo="append"
        lados={ladoTecnico}
        triggerLabel="Meus artilheiros"
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Meus artilheiros" }))

    // O existente aparece SOMENTE-LEITURA (não é um input editável).
    expect(screen.getByText("Vini")).toBeInTheDocument()
    // Orçamento: 2 já atribuídos de 4.
    expect(screen.getByText("2 de 4 gols atribuídos")).toBeInTheDocument()

    // Adiciona um autor novo (delta).
    fireEvent.click(screen.getByRole("button", { name: /Adicionar autor/i }))
    fireEvent.change(screen.getByLabelText("Autor 1 de Time A"), {
      target: { value: "João" },
    })

    // "X de Y" agora reflete 2 (existente) + 1 (novo) = 3 de 4.
    expect(screen.getByText("3 de 4 gols atribuídos")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))

    await waitFor(() => {
      expect(mockRegistrar).toHaveBeenCalledWith({
        matchId: "m1",
        lado: 1,
        // SÓ o delta [{João:1}] — NÃO reenvia Vini (a RPC já soma o existente).
        autores: [{ jogador: "João", gols: 1, contra: false }],
        modo: "append",
      })
    })
  })

  it("sem nada adicionado (só o existente), NÃO chama a RPC (delta vazio)", async () => {
    mockRegistrar.mockResolvedValue({ ok: true, total: 2 })
    render(
      <ArtilheirosEncerrada
        matchId="m1"
        modo="append"
        lados={ladoTecnico}
        triggerLabel="Meus artilheiros"
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Meus artilheiros" }))
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled())
    // Delta vazio → nenhuma chamada à RPC (nada a somar), mas conclui com sucesso.
    expect(mockRegistrar).not.toHaveBeenCalled()
  })
})

describe("ArtilheirosEncerrada — modo replace (organizador)", () => {
  it("pré-carrega os dois lados EDITÁVEIS e submete a LISTA COMPLETA por lado", async () => {
    mockRegistrar.mockResolvedValue({ ok: true, total: 2 })
    const lados: LadoEditavel[] = [
      { lado: 1, nomeLado: "Time A", placar: 2, existentes: [{ jogador: "Vini", gols: 2, contra: false }] },
      { lado: 2, nomeLado: "Time B", placar: 1, existentes: [{ jogador: "Zé", gols: 1, contra: false }] },
    ]
    render(
      <ArtilheirosEncerrada matchId="m1" modo="replace" lados={lados} triggerLabel="Artilheiros" />
    )
    fireEvent.click(screen.getByRole("button", { name: "Artilheiros" }))

    // Preload editável: o nome existente aparece num INPUT (value), não read-only.
    expect(screen.getByLabelText("Autor 1 de Time A")).toHaveValue("Vini")
    expect(screen.getByLabelText("Autor 1 de Time B")).toHaveValue("Zé")

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }))
    await waitFor(() => {
      // Um replace por lado, com a lista COMPLETA daquele lado.
      expect(mockRegistrar).toHaveBeenCalledWith({
        matchId: "m1",
        lado: 1,
        autores: [{ jogador: "Vini", gols: 2, contra: false }],
        modo: "replace",
      })
    })
    expect(mockRegistrar).toHaveBeenCalledWith({
      matchId: "m1",
      lado: 2,
      autores: [{ jogador: "Zé", gols: 1, contra: false }],
      modo: "replace",
    })
  })
})
