// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// O painel embute a action via useActionState — neutralizada no render.
vi.mock("@/actions/tournaments", () => ({
  iniciarMataMata: vi.fn(),
}))

import { IniciarMataMataPanel } from "@/features/knockout/components/IniciarMataMataPanel"

afterEach(cleanup)

const TOURNAMENT = "11111111-1111-4111-8111-111111111111"

function participantes(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, "0")}`,
    nome: `Jogador ${i + 1}`,
  }))
}

function renderPanel(qtd: number, opts?: { idaEVolta?: boolean; terceiroLugar?: boolean }) {
  return render(
    <IniciarMataMataPanel
      tournamentId={TOURNAMENT}
      participantes={participantes(qtd)}
      idaEVolta={opts?.idaEVolta ?? false}
      terceiroLugar={opts?.terceiroLugar ?? false}
    />
  )
}

describe("IniciarMataMataPanel — prévia e gates de quantidade", () => {
  it("prévia vem do MESMO motor da geração (N=4 simples: 3 jogos, 2 fases)", () => {
    renderPanel(4)
    expect(screen.getByText(/3 jogos em 2 fases/)).toBeInTheDocument()
  })

  it("prévia reflete ida-e-volta e 3º lugar (N=4: 2·2+1+1 = 6 jogos)", () => {
    renderPanel(4, { idaEVolta: true, terceiroLugar: true })
    expect(screen.getByText(/6 jogos em 2 fases/)).toBeInTheDocument()
  })

  it("prévia anuncia os byes (N=3: 1 avanço direto na 1ª fase)", () => {
    renderPanel(3)
    expect(screen.getByText(/1 clube avança direto/)).toBeInTheDocument()
  })

  it("menos de 2 clubes orienta e esconde o form", () => {
    renderPanel(1)
    expect(screen.getByRole("status")).toHaveTextContent(/pelo menos 2/)
    expect(screen.queryByRole("button", { name: /iniciar/i })).toBeNull()
  })

  it("acima do limite mostra alerta e esconde o form", () => {
    renderPanel(33)
    expect(screen.getByRole("alert")).toHaveTextContent(/no máximo 32/)
    expect(screen.queryByRole("button", { name: /iniciar/i })).toBeNull()
  })
})

describe("IniciarMataMataPanel — contrato de names com a action", () => {
  // Os names abaixo são parseados LITERALMENTE por iniciarMataMata
  // (formData.get/getAll) — um rename de um lado quebraria o chaveamento
  // silenciosamente. Estes asserts travam o contrato.
  it("form carrega tournamentId e o modo selecionado", () => {
    const { container } = renderPanel(4)
    const hidden = container.querySelector('input[name="tournamentId"]')
    expect(hidden).toHaveValue(TOURNAMENT)
    expect(container.querySelector('input[name="modo"][value="sorteio"]')).toBeChecked()
  })

  it("modo manual revela os selects slot_{i}_1/slot_{i}_2 (metade da chave)", () => {
    const { container } = renderPanel(4)
    fireEvent.click(screen.getByLabelText(/Montagem manual/))
    // Chave de 4 ⇒ 2 confrontos ⇒ slots 1 e 2, dois lados cada.
    for (const name of ["slot_1_1", "slot_1_2", "slot_2_1", "slot_2_2"]) {
      expect(container.querySelector(`select[name="${name}"]`)).toBeInTheDocument()
    }
    expect(container.querySelector('select[name="slot_3_1"]')).toBeNull()
  })

  it("modo manual com byes orienta quantos lados deixar vazios (N=3 → 1)", () => {
    renderPanel(3)
    fireEvent.click(screen.getByLabelText(/Montagem manual/))
    expect(screen.getByText(/deixe 1 lado vazio/)).toBeInTheDocument()
  })

  it("modo potes revela checkboxes name=cabecas e pede a metade exata", () => {
    const { container } = renderPanel(4)
    fireEvent.click(screen.getByLabelText(/Sorteio com potes/))
    expect(screen.getByText(/marque 2/)).toBeInTheDocument()
    expect(container.querySelectorAll('input[name="cabecas"]')).toHaveLength(4)
  })

  it("potes fica desabilitado fora de 4/8/16/32 (N=6) e habilitado com 8", () => {
    renderPanel(6)
    expect(screen.getByLabelText(/Sorteio com potes/)).toBeDisabled()
    expect(screen.getByText(/Exige 4, 8, 16, 32 clubes/)).toBeInTheDocument()
    cleanup()
    renderPanel(8)
    expect(screen.getByLabelText(/Sorteio com potes/)).toBeEnabled()
  })
})
