// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// Folhas client chamam Server Actions e TeamCrest usa next/image —
// neutralizados: o alvo é o GATE por papel da seção (quem vê o quê).
vi.mock("@/actions/slots", () => ({
  assumirVagaComoDono: vi.fn(),
  desistirDaVaga: vi.fn(),
  expulsarTecnico: vi.fn(),
  regenerarConviteVaga: vi.fn(),
}))
vi.mock("@/features/team/components/TeamCrest", () => ({
  TeamCrest: () => null,
}))

import { VagasSection } from "@/features/tournament/components/VagasSection"
import type { VagaDoTorneio } from "@/features/tournament/data/getVagasDoTorneio"

afterEach(cleanup)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "dono-1"
const TECNICO = "u1"

const VAGAS: VagaDoTorneio[] = [
  { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: { id: TECNICO, nome: "Ana" } },
  { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null },
]

function renderSection(over: Partial<Parameters<typeof VagasSection>[0]> = {}) {
  return render(
    <VagasSection
      vagas={VAGAS}
      userId="visitante"
      ehDono={false}
      tournamentId={TORNEIO}
      torneioEncerrado={false}
      {...over}
    />
  )
}

describe("VagasSection", () => {
  it("sem vagas mostra o estado vazio", () => {
    renderSection({ vagas: [] })
    expect(
      screen.getByText(/ainda não tem clubes definidos/)
    ).toBeInTheDocument()
  })

  it("visitante vê clube + técnico (ou 'vaga aberta'), sem NENHUMA ação", () => {
    renderSection()
    expect(screen.getByText("Grêmio")).toBeInTheDocument()
    expect(screen.getByText("téc. Ana")).toBeInTheDocument()
    expect(screen.getByText("vaga aberta")).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toEqual([])
  })

  it("técnico da vaga vê 'Desistir do clube' SÓ na própria vaga, com '(você)'", () => {
    renderSection({ userId: TECNICO })
    expect(screen.getByText("téc. Ana (você)")).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: "Desistir do clube" })
    ).toHaveLength(1)
    // Não ganha console de dono (convite/expulsar/assumir).
    expect(screen.queryByRole("button", { name: /Gerar/ })).toBeNull()
  })

  it("dono vê o console por vaga: link+copiar (com code), expulsar na ocupada e assumir na vazia", () => {
    renderSection({
      userId: DONO,
      ehDono: true,
      codigos: new Map([["s1", "aaaaaaaaaaaaaaaa"]]),
    })
    // Vaga s1 tem code → URL visível + Copiar; s2 sem code → só "Gerar link".
    expect(
      screen.getByText("http://localhost:3000/convite/aaaaaaaaaaaaaaaa")
    ).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Copiar link" })).toHaveLength(1)
    expect(
      screen.getByRole("button", { name: "Gerar novo link" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Gerar link" })).toBeInTheDocument()
    // Troca de técnico: expulsar onde HÁ técnico, assumir onde NÃO há.
    expect(
      screen.getAllByRole("button", { name: "Expulsar técnico" })
    ).toHaveLength(1)
    expect(
      screen.getAllByRole("button", { name: "Assumir o clube" })
    ).toHaveLength(1)
  })

  it("sem `codigos` (gate da page) o dono não vê nenhuma URL de convite", () => {
    renderSection({ userId: DONO, ehDono: true })
    expect(screen.queryByText(/\/convite\//)).toBeNull()
    expect(screen.queryByRole("button", { name: "Copiar link" })).toBeNull()
  })

  it("torneio ENCERRADO esconde todas as ações (dono e técnico)", () => {
    renderSection({
      userId: TECNICO,
      ehDono: true,
      torneioEncerrado: true,
      codigos: new Map([["s1", "aaaaaaaaaaaaaaaa"]]),
    })
    expect(screen.queryAllByRole("button")).toEqual([])
    expect(screen.queryByText(/\/convite\//)).toBeNull()
  })
})
