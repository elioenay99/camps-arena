// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import * as React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DemoProvider } from "@/features/demo/store/DemoProvider"
import { useDemoStore } from "@/features/demo/store/useDemoStore"
import { DemoHub } from "@/features/demo/components/DemoHub"
import { DemoTorneioView } from "@/features/demo/components/DemoTorneioView"
import { DemoTorneiosLista } from "@/features/demo/components/DemoTorneiosLista"
import { DemoLigaView } from "@/features/demo/components/DemoLigaView"

// Demonstração renderiza SEM sessão/cookies/supabase — nada é mockado do
// supabase porque a árvore /demo simplesmente não o importa (o guard de grafo
// garante). matchMedia é estubado (ClassificacaoResponsiva o usa).

function Wrap({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>
}

// Troca o perfil fictício para "gestor" antes de renderizar os filhos, para
// exercitar os controles de gestão (que ficam ocultos no perfil padrão
// "visitante").
function ComoGestor({ children }: { children: React.ReactNode }) {
  const { state, dispatch } = useDemoStore()
  React.useEffect(() => {
    if (state.perfil !== "gestor") {
      dispatch({ type: "TROCAR_PERFIL", perfil: "gestor" })
    }
  }, [state.perfil, dispatch])
  return state.perfil === "gestor" ? <>{children}</> : null
}

beforeEach(() => {
  window.localStorage.clear()
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
})

afterEach(cleanup)

describe("render da demonstração (sem sessão)", () => {
  it("o HUB renderiza sem supabase", () => {
    render(
      <Wrap>
        <DemoHub />
      </Wrap>
    )
    expect(screen.getByText("Sinta o Goliseu por dentro")).toBeInTheDocument()
    // Indicadores agregados presentes.
    expect(screen.getByText("Indicadores")).toBeInTheDocument()
  })

  it("torneio com id inexistente cai em fallback SEM fetch", () => {
    render(
      <Wrap>
        <DemoTorneioView id="nao-existe-123" />
      </Wrap>
    )
    expect(
      screen.getByText(/não encontrado nesta demonstração/i)
    ).toBeInTheDocument()
  })

  it("o torneio de liga renderiza a classificação ao vivo", () => {
    render(
      <Wrap>
        <DemoTorneioView id="demo-liga" />
      </Wrap>
    )
    expect(screen.getByText("Liga Goliseu — Série Ouro")).toBeInTheDocument()
    // A aba de classificação é a padrão.
    expect(screen.getAllByText(/Classificação/i).length).toBeGreaterThan(0)
  })

  it("a pirâmide oculta a gestão para visitante (perfil padrão)", () => {
    render(
      <Wrap>
        <DemoLigaView />
      </Wrap>
    )
    expect(
      screen.getByText(/aparecem para\s+perfis de gestor\/admin|perfis de gestor/i)
    ).toBeInTheDocument()
  })

  it("não emite console.error/warn nos fluxos principais", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {})
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { unmount } = render(
      <Wrap>
        <DemoHub />
      </Wrap>
    )
    unmount()
    render(
      <Wrap>
        <DemoTorneioView id="demo-liga" />
      </Wrap>
    )
    expect(erro).not.toHaveBeenCalled()
    expect(aviso).not.toHaveBeenCalled()
    erro.mockRestore()
    aviso.mockRestore()
  })

  it("a lista de torneios oculta gestão para visitante (perfil padrão)", () => {
    render(
      <Wrap>
        <DemoTorneiosLista />
      </Wrap>
    )
    // Isola um torneio conhecido apenas para inspecionar seus controles.
    expect(
      screen.getByText("Liga Goliseu — Série Ouro")
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /criar torneio/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^Editar$/i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /^Excluir /i })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", { name: /mudar status de/i })
    ).not.toBeInTheDocument()
  })

  it("excluir um torneio exige confirmação (só some após confirmar)", async () => {
    const user = userEvent.setup()
    render(
      <Wrap>
        <ComoGestor>
          <DemoTorneiosLista />
        </ComoGestor>
      </Wrap>
    )
    // Isola um torneio pela busca.
    await user.type(screen.getByPlaceholderText(/buscar por nome/i), "Série Ouro")
    const nome = "Liga Goliseu — Série Ouro"
    expect(screen.getByText(nome)).toBeInTheDocument()

    // Abre o dialog de exclusão — o torneio AINDA está listado.
    await user.click(
      screen.getByRole("button", { name: new RegExp(`Excluir ${nome}`, "i") })
    )
    expect(screen.getByText(nome)).toBeInTheDocument()

    // Confirma no dialog (botão com nome exato "Excluir").
    await user.click(screen.getByRole("button", { name: "Excluir" }))
    await waitFor(() =>
      expect(screen.queryByText(nome)).not.toBeInTheDocument()
    )
  })
})
