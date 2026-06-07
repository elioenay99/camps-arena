// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

// O painel embute a action via useActionState — neutralizada no render.
vi.mock("@/actions/tournaments", () => ({
  iniciarTorneioGrupos: vi.fn(),
}))

import { IniciarGruposPanel } from "@/features/groups/components/IniciarGruposPanel"
import { previaGrupos } from "@/features/groups/gerarFaseDeGrupos"

afterEach(cleanup)

const TOURNAMENT = "11111111-1111-4111-8111-111111111111"

function participantes(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, "0")}`,
    nome: `Jogador ${i + 1}`,
  }))
}

function renderPanel(
  qtd: number,
  opts?: { idaEVolta?: boolean; terceiroLugar?: boolean; faseLiga?: boolean }
) {
  return render(
    <IniciarGruposPanel
      tournamentId={TOURNAMENT}
      participantes={participantes(qtd)}
      idaEVolta={opts?.idaEVolta ?? false}
      terceiroLugar={opts?.terceiroLugar ?? false}
      faseLiga={opts?.faseLiga ?? false}
    />
  )
}

describe("IniciarGruposPanel — prévia vem do MESMO motor da geração", () => {
  it("N=8: a prévia ecoa previaGrupos no default derivado e reage à troca de K", () => {
    const { container } = renderPanel(8)
    // Default DERIVADO das opções válidas: primeiro G >= 2 e primeiro K dele
    // (G=2, K=1) — estado inicial sempre submetível (achado da validação).
    const padrao = previaGrupos(8, 2, 1, false, false)
    expect(
      screen.getByText(
        new RegExp(`${padrao.jogosGrupos} jogos na fase de grupos \\(${padrao.rodadasGrupos} rodadas\\)`)
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        new RegExp(`${padrao.jogosChave} jogo em ${padrao.fasesChave} fase`)
      )
    ).toBeInTheDocument()

    // Troca para K=2: a prévia recalcula pelo MESMO motor.
    fireEvent.change(container.querySelector('select[name="classificadosPorGrupo"]')!, {
      target: { value: "2" },
    })
    const p = previaGrupos(8, 2, 2, false, false)
    expect(p).toMatchObject({
      jogosGrupos: 12,
      rodadasGrupos: 3,
      jogosChave: 3,
      fasesChave: 2,
    })
    expect(
      screen.getByText(new RegExp(`${p.jogosChave} jogos em ${p.fasesChave} fases`))
    ).toBeInTheDocument()
  })
})

describe("IniciarGruposPanel — contrato de names com a action (Copa)", () => {
  // Estes names são parseados LITERALMENTE pela action; um rename quebraria a
  // geração silenciosamente. Os asserts travam o contrato.
  it("form carrega tournamentId, modo sorteio default e os selects qtdGrupos/classificadosPorGrupo", () => {
    const { container } = renderPanel(8)
    expect(container.querySelector('input[name="tournamentId"]')).toHaveValue(TOURNAMENT)
    expect(container.querySelector('input[name="modo"][value="sorteio"]')).toBeChecked()
    expect(container.querySelector('select[name="qtdGrupos"]')).toBeInTheDocument()
    expect(container.querySelector('select[name="classificadosPorGrupo"]')).toBeInTheDocument()
  })

  it("os selects só expõem opções válidas para o N (G ∈ {2,4}; G=2 ⇒ K ∈ {1,2})", () => {
    const { container } = renderPanel(8)
    const grupos = container.querySelector('select[name="qtdGrupos"]')!
    const gOpcoes = [...grupos.querySelectorAll("option")].map((o) => o.getAttribute("value"))
    // N=8: G >= 2 no formato de grupos (grupo único é o formato Fase de liga).
    expect(gOpcoes).toEqual(["2", "4"])

    const classif = container.querySelector('select[name="classificadosPorGrupo"]')!
    const kOpcoes = [...classif.querySelectorAll("option")].map((o) => o.getAttribute("value"))
    // Default G=2 ⇒ K ∈ {1, 2}.
    expect(kOpcoes).toEqual(["1", "2"])
  })
})

describe("IniciarGruposPanel — fase de liga (Champions, G fixo em 1)", () => {
  it("não mostra select de grupos, fixa qtdGrupos=1 em hidden e omite potes/manual", () => {
    const { container } = renderPanel(8, { faseLiga: true })
    // Sem escolha de grupos: G é 1 por definição do formato.
    expect(container.querySelector('select[name="qtdGrupos"]')).toBeNull()
    const hidden = container.querySelector('input[type="hidden"][name="qtdGrupos"]')
    expect(hidden).toHaveValue("1")
    // Distribuição por potes/manual não faz sentido com grupo único.
    expect(screen.queryByLabelText(/Sorteio com potes/)).toBeNull()
    expect(screen.queryByLabelText(/Montagem manual/)).toBeNull()
    // Sorteio (ordem da tabela) segue disponível.
    expect(container.querySelector('input[name="modo"][value="sorteio"]')).toBeInTheDocument()
  })
})

describe("IniciarGruposPanel — modos potes e manual (progressive disclosure)", () => {
  it("modo potes revela checkboxes name=cabecas e orienta a marcar G", () => {
    const { container } = renderPanel(8)
    fireEvent.click(screen.getByLabelText(/Sorteio com potes/))
    // Default G=2: orienta marcar 2 cabeças (uma por grupo). A orientação
    // aparece na legenda do fieldset e no subtítulo do rádio — basta existir.
    expect(screen.getAllByText(/marque 2/i).length).toBeGreaterThan(0)
    // Uma checkbox por participante, todas com o mesmo name agregável.
    expect(container.querySelectorAll('input[name="cabecas"]')).toHaveLength(8)
  })

  it("modo manual revela um select name=grupo_de_<id> por participante", () => {
    const { container } = renderPanel(8)
    fireEvent.click(screen.getByLabelText(/Montagem manual/))
    for (const p of participantes(8)) {
      expect(
        container.querySelector(`select[name="grupo_de_${p.id}"]`)
      ).toBeInTheDocument()
    }
  })
})

describe("IniciarGruposPanel — gates de quantidade/configuração", () => {
  it("menos de 2 participantes orienta a convidar e esconde o form", () => {
    renderPanel(1)
    expect(screen.getByRole("status")).toHaveTextContent(/pelo menos 2/)
    expect(screen.queryByRole("button", { name: /iniciar/i })).toBeNull()
  })

  it("sem configuração válida (N=2, G=2 não cabe) orienta a convidar mais", () => {
    // N=2: o menor grupo de qualquer G>=2 fica < 2 e G=1 exige K>=2 (= grupo),
    // logo nenhuma combinação é válida — opcoes vazias.
    renderPanel(2)
    expect(screen.getByRole("status")).toHaveTextContent(/não há configuração válida/i)
    expect(screen.queryByRole("button", { name: /iniciar/i })).toBeNull()
  })
})

describe("IniciarGruposPanel — estado inicial sempre submetível", () => {
  it("N=3 em grupos: sem configuração válida (G>=2 exige 4+), orienta a convidar — sem travar", () => {
    // Achado da validação adversarial: defaults fixos travavam o painel.
    // Com G >= 2 obrigatório no formato de grupos, N=3 legitimamente não tem
    // configuração — o painel orienta em vez de nascer desabilitado sem saída.
    renderPanel(3)
    expect(screen.getByRole("status")).toHaveTextContent(/não há configuração válida/i)
    expect(screen.queryByRole("button", { name: /iniciar/i })).toBeNull()
  })

  it("N=4: abre já submetível (default derivado G=2/K=1, nunca combinação inválida)", () => {
    const { container } = renderPanel(4)
    const g = container.querySelector('select[name="qtdGrupos"]') as HTMLSelectElement
    const k = container.querySelector(
      'select[name="classificadosPorGrupo"]'
    ) as HTMLSelectElement
    expect(g.value).toBe("2")
    expect(k.value).toBe("1")
    expect(screen.getByRole("button", { name: /iniciar/i })).toBeEnabled()
  })
})
