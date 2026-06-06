// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// O form de aceite é client e chama Server Action — neutralizada no render.
vi.mock("@/actions/participants", () => ({ aceitarConvite: vi.fn() }))

import ConvitePage from "@/app/convite/[codigo]/page"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

// Código válido no formato do invite-code (Crockford base32 minúsculo, 16).
const CODIGO = "abcdefghjkmnpqrs"
const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  user?: { id: string } | null
  info?: {
    tournament_id: string
    titulo: string
    status: string
    formato: string
    ja_participa: boolean
  } | null
}

function montarClient(c: Cenario) {
  const rpcSpy = vi.fn(async () => ({
    data: c.info ? [c.info] : [],
    error: null,
  }))
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: c.user ?? null } })) },
    rpc: rpcSpy,
  } as unknown as never)
  return { rpcSpy }
}

/** RSC assíncrono: renderiza o JSX resolvido (padrão para páginas async). */
async function renderPage(codigo = CODIGO) {
  const jsx = await ConvitePage({ params: Promise.resolve({ codigo }) })
  return render(jsx)
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe("ConvitePage", () => {
  it("deslogado: CTAs de login/cadastro com retorno ao convite, sem rpc", async () => {
    const { rpcSpy } = montarClient({ user: null })
    await renderPage()
    const entrar = screen.getByRole("link", { name: "Entrar" })
    expect(entrar).toHaveAttribute(
      "href",
      `/login?redirectTo=${encodeURIComponent(`/convite/${CODIGO}`)}`
    )
    expect(screen.getByRole("link", { name: "Criar conta" })).toBeInTheDocument()
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("código com formato inválido recebe aviso único SEM tocar o banco", async () => {
    const { rpcSpy } = montarClient({ user: { id: "u1" } })
    await renderPage("###-lixo")
    expect(screen.getByRole("status")).toHaveTextContent(/inválido ou expirado/)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("código inexistente (rpc vazio) recebe o MESMO aviso", async () => {
    montarClient({ user: { id: "u1" }, info: null })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/inválido ou expirado/)
  })

  it("quem já participa vê atalho ao torneio, sem botão de aceite", async () => {
    montarClient({
      user: { id: "u1" },
      info: {
        tournament_id: TORNEIO,
        titulo: "Liga da Firma",
        status: "ativo",
        formato: "liga",
        ja_participa: true,
      },
    })
    await renderPage()
    expect(screen.getByRole("link", { name: "Abrir o torneio" })).toHaveAttribute(
      "href",
      `/dashboard/torneios/${TORNEIO}`
    )
    expect(screen.queryByRole("button", { name: "Entrar no torneio" })).toBeNull()
  })

  it("torneio encerrado explica o bloqueio sem botão de aceite", async () => {
    montarClient({
      user: { id: "u1" },
      info: {
        tournament_id: TORNEIO,
        titulo: "Copa",
        status: "encerrado",
        formato: "avulso",
        ja_participa: false,
      },
    })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/encerrado/)
    expect(screen.queryByRole("button", { name: "Entrar no torneio" })).toBeNull()
  })

  it("liga INICIADA explica o bloqueio ANTES do clique, sem botão de aceite", async () => {
    montarClient({
      user: { id: "u1" },
      info: {
        tournament_id: TORNEIO,
        titulo: "Liga da Firma",
        status: "ativo",
        formato: "liga",
        ja_participa: false,
      },
    })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/já foi iniciada/)
    expect(screen.queryByRole("button", { name: "Entrar no torneio" })).toBeNull()
  })

  it("liga em RASCUNHO segue aceitando: convite válido mostra o botão", async () => {
    montarClient({
      user: { id: "u1" },
      info: {
        tournament_id: TORNEIO,
        titulo: "Liga da Firma",
        status: "rascunho",
        formato: "liga",
        ja_participa: false,
      },
    })
    await renderPage()
    expect(screen.getByText(/Você foi convidado/)).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Entrar no torneio" })
    ).toBeInTheDocument()
  })

  it("torneio avulso ativo segue aceitando normalmente", async () => {
    montarClient({
      user: { id: "u1" },
      info: {
        tournament_id: TORNEIO,
        titulo: "Copa",
        status: "ativo",
        formato: "avulso",
        ja_participa: false,
      },
    })
    await renderPage()
    expect(
      screen.getByRole("button", { name: "Entrar no torneio" })
    ).toBeInTheDocument()
  })
})
