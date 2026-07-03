// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Vitrine (add-vitrine-publica-e-compartilhar): exige login e lista os cards do
// loader. `getVitrine` e o auth do Supabase são mockados; os cards renderizam de
// verdade (ChampionshipBadge/pills/Link).
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/discovery/data/getVitrine", () => ({ getVitrine: vi.fn() }))

import ExplorarPage from "@/app/dashboard/explorar/page"
import { createClient } from "@/lib/supabase/server"
import { getVitrine } from "@/features/discovery/data/getVitrine"

const mockCreateClient = vi.mocked(createClient)
const mockGetVitrine = vi.mocked(getVitrine)

function auth(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
}

async function renderPage() {
  return render(await ExplorarPage())
}

beforeEach(() => {
  mockCreateClient.mockReset()
  mockGetVitrine.mockReset()
})
afterEach(cleanup)

describe("ExplorarPage", () => {
  it("não-logado: redireciona para o login (não carrega a vitrine)", async () => {
    auth(null)
    await expect(renderPage()).rejects.toThrow(
      "NEXT_REDIRECT:/login?redirectTo=/dashboard/explorar"
    )
    expect(mockGetVitrine).not.toHaveBeenCalled()
  })

  it("vitrine vazia: estado vazio", async () => {
    auth({ id: "u1" })
    mockGetVitrine.mockResolvedValue([])
    await renderPage()
    expect(
      screen.getByText("Nenhuma competição pública ainda")
    ).toBeInTheDocument()
  })

  it("com itens: renderiza cards com título, dono e link para a visão de leitura", async () => {
    auth({ id: "u1" })
    mockGetVitrine.mockResolvedValue([
      {
        tipo: "torneio",
        id: "t-1",
        href: "/dashboard/torneios/t-1",
        titulo: "Torneio Y",
        status: "ativo",
        formato: "mata_mata",
        corPrimaria: null,
        corSecundaria: null,
        dono: "Bruno",
        createdAt: "2026-01-05T00:00:00Z",
      },
      {
        tipo: "liga",
        id: "comp-1",
        href: "/dashboard/ligas/s2",
        titulo: "Liga X",
        status: "em_fluxo",
        corPrimaria: null,
        corSecundaria: null,
        dono: "Ana",
        createdAt: "2026-01-02T00:00:00Z",
      },
    ])
    await renderPage()

    const torneioLink = screen.getByRole("link", { name: /Torneio Y/i })
    expect(torneioLink).toHaveAttribute("href", "/dashboard/torneios/t-1")
    expect(torneioLink).toHaveTextContent(/por Bruno/i)

    const ligaLink = screen.getByRole("link", { name: /Liga X/i })
    expect(ligaLink).toHaveAttribute("href", "/dashboard/ligas/s2")
    expect(ligaLink).toHaveTextContent(/por Ana/i)

    expect(screen.queryByText("Nenhuma competição pública ainda")).toBeNull()
  })
})
