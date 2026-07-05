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
  {
    id: "s1",
    clube: "Grêmio",
    escudoUrl: null,
    tecnico: { id: TECNICO, nome: "Ana", avatar: null },
    porNome: false,
  },
  { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null, porNome: false },
]

/**
 * Botões de AÇÃO da seção — exclui o gatilho de ajuda "?" ("O que é Vaga?"),
 * que é informativo e SEMPRE presente no cabeçalho (o termo se explica a
 * qualquer visitante). A intenção guardada é: read-only não vê nenhum CONTROLE
 * de ação (convite/expulsar/assumir/desistir).
 */
const botoesDeAcao = () =>
  screen
    .queryAllByRole("button")
    .filter((b) => !b.getAttribute("aria-label")?.startsWith("O que é"))

function renderSection(over: Partial<Parameters<typeof VagasSection>[0]> = {}) {
  return render(
    <VagasSection
      vagas={VAGAS}
      userId="visitante"
      podeModerar={false}
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

  it("ancora o '?' de ajuda 'Vaga' no cabeçalho (visível a qualquer visitante)", () => {
    renderSection()
    expect(
      screen.getByRole("button", { name: "O que é Vaga?" })
    ).toBeInTheDocument()
    // Não polui o nome acessível do heading "Vagas" (gatilho é IRMÃO do <h2>).
    expect(screen.getByRole("heading", { name: "Vagas" })).toBeInTheDocument()
  })

  it("visitante vê clube + técnico (ou 'vaga aberta'), sem NENHUMA ação", () => {
    renderSection()
    expect(screen.getByText("Grêmio")).toBeInTheDocument()
    expect(screen.getByText("téc. Ana")).toBeInTheDocument()
    expect(screen.getByText("vaga aberta")).toBeInTheDocument()
    expect(botoesDeAcao()).toEqual([])
  })

  it("técnico da vaga vê 'Desistir do clube' SÓ na própria vaga, com '(você)'", () => {
    renderSection({ userId: TECNICO })
    expect(screen.getByText("téc. Ana (você)")).toBeInTheDocument()
    expect(
      screen.getAllByRole("button", { name: "Desistir do clube" })
    ).toHaveLength(1)
    // Não ganha console de moderação (convite/expulsar/assumir).
    expect(screen.queryByRole("button", { name: /Gerar/ })).toBeNull()
  })

  it("quem modera vê o console por vaga: link+copiar (com code), expulsar na ocupada e assumir na vazia", () => {
    renderSection({
      userId: DONO,
      podeModerar: true,
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

  it("sem `codigos` (gate da page) quem modera não vê nenhuma URL de convite", () => {
    renderSection({ userId: DONO, podeModerar: true })
    expect(screen.queryByText(/\/convite\//)).toBeNull()
    expect(screen.queryByRole("button", { name: "Copiar link" })).toBeNull()
  })

  it("torneio ENCERRADO esconde todas as ações (moderação e técnico)", () => {
    renderSection({
      userId: TECNICO,
      podeModerar: true,
      torneioEncerrado: true,
      codigos: new Map([["s1", "aaaaaaaaaaaaaaaa"]]),
    })
    expect(botoesDeAcao()).toEqual([])
    expect(screen.queryByText(/\/convite\//)).toBeNull()
  })
})
