// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"

const calcularFluxoTemporada = vi.fn()
const confirmarFluxoTemporada = vi.fn()

vi.mock("@/actions/leaguePyramid", () => ({
  calcularFluxoTemporada: (...args: unknown[]) => calcularFluxoTemporada(...args),
  confirmarFluxoTemporada: (...args: unknown[]) => confirmarFluxoTemporada(...args),
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("next/image", () => ({
  default: (props: { src: unknown; alt?: string }) => {
    const src = typeof props.src === "string" ? props.src : ""
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={props.alt ?? ""} />
  },
}))

import {
  FluxoTemporadaPanel,
  type CompetidorRotulo,
} from "@/features/league/components/FluxoTemporadaPanel"
import type { ItemPlanoFluxo } from "@/features/league/flowEngine"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const item = (over: Partial<ItemPlanoFluxo> & { competitorId: string }): ItemPlanoFluxo => ({
  nivelOrigem: 1,
  nivelDestino: 1,
  posicaoFinal: 1,
  pontos: 0,
  jogos: 10,
  destino: "permanece",
  resolvidoPor: "classificacao",
  ...over,
})

// Nomes LONGOS de propósito: o defeito que esta suíte trava é o nome ser
// esmagado a poucos caracteres pelas pílulas da mesma linha.
const NOME_LONGO = "Sport Club do Recife"
const NOME_LONGO_2 = "Associação Chapecoense de Futebol"

const competidores: Record<string, CompetidorRotulo> = {
  c1: { nome: NOME_LONGO },
  c2: { nome: NOME_LONGO_2 },
  c3: { nome: "Clube de Regatas Vasco" },
}

/** Plano com um corte de rebaixamento decidido por SORTEIO (habilita reordenar). */
function planoComSorteio() {
  return {
    ok: true as const,
    plano: {
      seed: "temporada-1",
      itens: [
        item({ competitorId: "c1", posicaoFinal: 9, destino: "cai", resolvidoPor: "sorteio", cortePonta: "cai", nivelDestino: 2 }),
        item({ competitorId: "c2", posicaoFinal: 9, destino: "permanece", resolvidoPor: "sorteio", cortePonta: "cai" }),
      ],
    },
  }
}

async function abrirPlano(resposta: unknown) {
  calcularFluxoTemporada.mockResolvedValue(resposta)
  render(<FluxoTemporadaPanel seasonId="s1" competidores={competidores} ehDono />)
  await userEvent.click(screen.getByRole("button", { name: /Calcular fluxo/ }))
  await screen.findByText(/Plano de sobe e cai/)
}

describe("FluxoTemporadaPanel — legibilidade da linha do competidor", () => {
  it("mostra o nome COMPLETO do competidor, sem depender de truncamento", async () => {
    await abrirPlano({
      ok: true,
      plano: {
        seed: "s",
        itens: [item({ competitorId: "c3", posicaoFinal: 1, destino: "sobe", nivelDestino: 1 })],
      },
    })
    // O nome é um nó de texto próprio (não concatenado com as pílulas): é isso
    // que garante que ele tem uma faixa só dele no mobile.
    expect(screen.getByText("Clube de Regatas Vasco")).toBeInTheDocument()
  })

  it("separa a identidade das pílulas/controles em faixas irmãs", async () => {
    await abrirPlano(planoComSorteio())
    const linha = screen.getByText(NOME_LONGO).closest("li")
    expect(linha).not.toBeNull()
    // Faixa da identidade e faixa dos controles são filhos DIRETOS do <li>, e o
    // <li> empilha no mobile (`flex-col`) voltando à linha única em `sm:`.
    expect(linha).toHaveClass("flex-col")
    expect(linha).toHaveClass("sm:flex-row")
  })

  it("separa as setas de desempate no mobile (ações OPOSTAS não colam)", async () => {
    await abrirPlano(planoComSorteio())
    const grupo = screen.getAllByRole("group", { name: "Reordenar empate" })[0]
    // gap > 0 no mobile: com gap zero um toque na borda de "subir" dispara
    // "descer" — no desempate que decide rebaixamento.
    expect(grupo).toHaveClass("gap-1.5")
    // Lado a lado no mobile, empilhado só no desktop: é o que paga o alvo de
    // 44px sem alongar a linha.
    expect(grupo).toHaveClass("md:flex-col")
    const botoes = within(grupo).getAllByRole("button")
    expect(botoes).toHaveLength(2)
    for (const b of botoes) expect(b).toHaveClass("size-11")
  })

  it("as setas continuam acionando subir e descer", async () => {
    await abrirPlano(planoComSorteio())
    // c1 está em 1º no grupo (levou a vaga do sorteio) → "subir" desabilitado,
    // "descer" ativo; em c2 é o inverso. Prova que os alvos não trocaram de papel.
    const subirC1 = screen.getByRole("button", { name: `Subir ${NOME_LONGO} no desempate` })
    const descerC1 = screen.getByRole("button", { name: `Descer ${NOME_LONGO} no desempate` })
    expect(subirC1).toBeDisabled()
    expect(descerC1).toBeEnabled()

    await userEvent.click(descerC1)
    // Após a troca, c2 assume a vaga: o chip de destino "cai" acompanha o nome.
    expect(
      screen.getByRole("button", { name: `Subir ${NOME_LONGO} no desempate` })
    ).toBeEnabled()
  })

  it("o motivo do chip existe em TEXTO, não só no title (tooltip não abre em toque)", async () => {
    await abrirPlano(planoComSorteio())
    // Rótulo curto (desktop) e explicação longa (mobile) convivem no DOM; o CSS
    // escolhe qual aparece. O que importa é a explicação não viver só no title.
    expect(screen.getAllByText("Sorteio").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Decidido por sorteio").length).toBeGreaterThan(0)
  })

  it("chip de playoff também explica em texto", async () => {
    await abrirPlano({
      ok: true,
      plano: {
        seed: "s",
        itens: [
          item({ competitorId: "c1", posicaoFinal: 4, destino: "sobe", resolvidoPor: "playoff", nivelDestino: 1 }),
        ],
      },
    })
    expect(screen.getAllByText("Playoff").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Decidido na chave").length).toBeGreaterThan(0)
  })
})
