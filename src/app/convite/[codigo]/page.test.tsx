// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// Os forms de aceite são client e chamam Server Actions — neutralizadas no
// render; TeamCrest usa next/image (idem).
vi.mock("@/actions/participants", () => ({ aceitarConvite: vi.fn() }))
vi.mock("@/actions/slots", () => ({ aceitarConviteVaga: vi.fn() }))
vi.mock("@/features/team/components/TeamCrest", () => ({
  TeamCrest: () => null,
}))

import ConvitePage from "@/app/convite/[codigo]/page"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

// Código válido no formato do invite-code (Crockford base32 minúsculo, 16).
const CODIGO = "abcdefghjkmnpqrs"
const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  user?: { id: string } | null
  /** Resposta de `info_convite` (fluxo genérico/avulso). */
  info?: {
    tournament_id: string
    titulo: string
    status: string
    formato: string
    ja_participa: boolean
  } | null
  /** Resposta de `info_convite_vaga` (convite de VAGA, clube-cêntrico). */
  vaga?: {
    tournament_id: string
    titulo: string
    status: string
    clube: string
    escudo_url: string | null
    vaga_ocupada: boolean
    ja_tem_vaga: boolean
  } | null
}

function montarClient(c: Cenario) {
  // A página tenta o RPC de VAGA primeiro e cai no genérico se não achar —
  // o mock distingue pelo NOME para cobrir a precedência.
  const rpcSpy = vi.fn(async (fn: string) => {
    if (fn === "info_convite_vaga") {
      return { data: c.vaga ? [c.vaga] : [], error: null }
    }
    return { data: c.info ? [c.info] : [], error: null }
  })
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

  it.each(["liga", "mata_mata"])(
    "formato gerado (%s) INICIADO explica o bloqueio ANTES do clique, sem botão de aceite",
    async (formato) => {
      montarClient({
        user: { id: "u1" },
        info: {
          tournament_id: TORNEIO,
          titulo: "Copa da Firma",
          status: "ativo",
          formato,
          ja_participa: false,
        },
      })
      await renderPage()
      expect(screen.getByRole("status")).toHaveTextContent(/já foi iniciado/)
      expect(screen.queryByRole("button", { name: "Entrar no torneio" })).toBeNull()
    }
  )

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
    const { rpcSpy } = montarClient({
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
    // Fallback: tentou a VAGA primeiro e só então o genérico.
    expect(rpcSpy.mock.calls.map((c) => c[0])).toEqual([
      "info_convite_vaga",
      "info_convite",
    ])
  })
})

describe("ConvitePage — convite de VAGA (clube-cêntrico)", () => {
  const vagaBase = {
    tournament_id: TORNEIO,
    titulo: "Liga dos Clubes",
    status: "rascunho",
    clube: "Palmeiras",
    escudo_url: "https://media.api-sports.io/football/teams/121.png",
    vaga_ocupada: false,
    ja_tem_vaga: false,
  }

  it("vaga livre: mostra o clube e o botão de assumir, SEM consultar o convite genérico", async () => {
    const { rpcSpy } = montarClient({ user: { id: "u1" }, vaga: vagaBase })
    await renderPage()
    expect(
      screen.getByText(/comandar Palmeiras como técnico/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "Assumir o clube" })
    ).toBeInTheDocument()
    // Precedência: achou a vaga → o RPC genérico não é chamado.
    expect(rpcSpy.mock.calls.map((c) => c[0])).toEqual(["info_convite_vaga"])
  })

  it("vaga já ocupada explica e não mostra botão", async () => {
    montarClient({
      user: { id: "u1" },
      vaga: { ...vagaBase, vaga_ocupada: true },
    })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/já tem um técnico/)
    expect(screen.queryByRole("button", { name: "Assumir o clube" })).toBeNull()
  })

  it("quem já comanda um clube no torneio vê atalho, sem botão de aceite", async () => {
    montarClient({
      user: { id: "u1" },
      vaga: { ...vagaBase, ja_tem_vaga: true },
    })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/já comanda um clube/)
    expect(screen.getByRole("link", { name: "Abrir o torneio" })).toHaveAttribute(
      "href",
      `/dashboard/torneios/${TORNEIO}`
    )
    expect(screen.queryByRole("button", { name: "Assumir o clube" })).toBeNull()
  })

  it("torneio encerrado bloqueia novos técnicos", async () => {
    montarClient({
      user: { id: "u1" },
      vaga: { ...vagaBase, status: "encerrado" },
    })
    await renderPage()
    expect(screen.getByRole("status")).toHaveTextContent(/não aceita novos técnicos/)
    expect(screen.queryByRole("button", { name: "Assumir o clube" })).toBeNull()
  })

  it("ja_tem_vaga tem precedência sobre vaga_ocupada (atalho, não beco)", async () => {
    // Quem já comanda um clube e abre o link de uma vaga ocupada recebe o
    // ATALHO ao torneio (a ocupação da vaga é irrelevante para ele).
    montarClient({
      user: { id: "u1" },
      vaga: { ...vagaBase, ja_tem_vaga: true, vaga_ocupada: true },
    })
    await renderPage()
    expect(screen.getByRole("link", { name: "Abrir o torneio" })).toBeInTheDocument()
  })

  it("deslogado nem tenta o RPC de vaga (código é credencial; preview exige sessão)", async () => {
    const { rpcSpy } = montarClient({ user: null, vaga: vagaBase })
    await renderPage()
    expect(screen.getByRole("link", { name: "Entrar" })).toBeInTheDocument()
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
