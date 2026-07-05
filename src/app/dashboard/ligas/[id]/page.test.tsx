// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Guard da VISÃO DE LEITURA da página da liga (add-liga-visao-leitura): qualquer
// logado vê classificação/estados; os controles de GESTÃO só aparecem com
// `podeGerir`. Loaders e folhas client são mockados; os controles de gestão viram
// marcadores testid para asserção de presença/ausência.
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/league/data/getSeason", () => ({ getSeason: vi.fn() }))
vi.mock("@/features/league/data/getArtilharia", () => ({
  getArtilharia: vi.fn(async () => []),
}))
vi.mock("@/features/league/data/getDivisionStandings", () => ({
  getDivisionStandings: vi.fn(),
}))
vi.mock("@/features/league/data/getGrandeFinal", () => ({
  getGrandeFinal: vi.fn(async () => null),
}))
vi.mock("@/features/league/data/getPlayoffs", () => ({
  getPlayoffs: vi.fn(async () => ({
    temPlayoffs: false,
    algumaMontada: false,
    resolvidos: false,
    fronteiras: [],
  })),
}))
// Folhas client da vitrine (add-vitrine-publica-e-compartilhar): neutralizadas
// (useRouter/Web Share). Stubs identificáveis para asserção de GATING por gestor.
vi.mock("@/features/discovery/components/ListarVitrineToggle", () => ({
  ListarVitrineToggle: () => <span>Listar na vitrine pública</span>,
}))
vi.mock("@/features/discovery/components/CompartilharCompetitionButton", () => ({
  CompartilharCompetitionButton: () => <button>Compartilhar</button>,
}))
// Controles de GESTÃO → marcadores testid.
vi.mock("@/features/league/components/MontarTemporadaButton", () => ({
  MontarTemporadaButton: () => <div data-testid="btn-montar" />,
}))
vi.mock("@/features/league/components/IniciarDivisaoButton", () => ({
  IniciarDivisaoButton: () => <div data-testid="btn-iniciar" />,
}))
vi.mock("@/features/league/components/TurnoDivisaoControl", () => ({
  TurnoDivisaoControl: () => <div data-testid="turno" />,
}))
vi.mock("@/features/league/components/FluxoTemporadaPanel", () => ({
  FluxoTemporadaPanel: () => <div data-testid="fluxo" />,
}))
vi.mock("@/features/league/components/PlayoffsPanel", () => ({
  PlayoffsPanel: () => <div data-testid="playoffs" />,
}))
vi.mock("@/features/league/components/GrandeFinalPanel", () => ({
  GrandeFinalPanel: () => <div data-testid="grande-final" />,
}))
// Leitura → marcador; decorativos → null.
vi.mock("@/features/standings/components/StandingsTable", () => ({
  StandingsTable: () => <div data-testid="standings" />,
}))
vi.mock("@/features/league/components/SeasonStatusPill", () => ({
  SeasonStatusPill: () => null,
}))
vi.mock("@/features/knockout/components/BracketView", () => ({
  BracketView: () => null,
}))
vi.mock("@/features/championship/components/ChampionshipBadge", () => ({
  ChampionshipBadge: () => null,
}))

import LigaPage from "@/app/dashboard/ligas/[id]/page"
import { createClient } from "@/lib/supabase/server"
import { getSeason } from "@/features/league/data/getSeason"
import { getDivisionStandings } from "@/features/league/data/getDivisionStandings"
import { redirect } from "next/navigation"

const mockCreateClient = vi.mocked(createClient)
const mockGetSeason = vi.mocked(getSeason)
const mockGetDivisionStandings = vi.mocked(getDivisionStandings)
const mockRedirect = vi.mocked(redirect)

const SEASON = "22222222-2222-4222-8222-222222222222"
const DONO = "dono-1"

const ZONAS_VAZIAS = {
  acesso: [],
  rebaixamento: [],
  playoffAcesso: [],
  playoffRebaixamento: [],
}

/** Temporada montada: div-1 iniciada (tabela) + div-2 em rascunho (não iniciada). */
function temporada(podeGerir: boolean) {
  return {
    seasonId: SEASON,
    numero: 1,
    status: "ativa",
    ciclo: "anual",
    competicao: {
      id: "comp-1",
      nome: "Pirâmide",
      criadaPor: DONO,
      corPrimaria: null,
      corSecundaria: null,
      listada: false,
    },
    divisoes: [
      {
        id: "div-1",
        nivel: 1,
        nome: "Série A",
        porNome: false,
        desempate: "saldo",
        tamanho: 4,
        tournamentId: "t-1",
        tournamentIdClausura: null,
        finalTournamentId: null,
        corPrimaria: null,
        corSecundaria: null,
        formato: "liga",
        idaEVolta: false,
        iniciada: true,
      },
      {
        id: "div-2",
        nivel: 2,
        nome: "Série B",
        porNome: false,
        desempate: "saldo",
        tamanho: 4,
        tournamentId: "t-2",
        tournamentIdClausura: null,
        finalTournamentId: null,
        corPrimaria: null,
        corSecundaria: null,
        formato: "liga",
        idaEVolta: false,
        iniciada: false,
      },
    ],
    fronteiras: [],
    competidores: {},
    podeGerir,
  } as unknown as Awaited<ReturnType<typeof getSeason>>
}

function montarCenario(c: { user?: { id: string } | null; podeGerir?: boolean }) {
  const user = c.user === undefined ? { id: DONO } : c.user
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as never)
  mockGetSeason.mockResolvedValue(temporada(c.podeGerir ?? true))
  // div-1 tem tabela (status ativo); div-2 em rascunho (não iniciada).
  mockGetDivisionStandings.mockImplementation(
    async (divisionSeasonId: string) =>
      ({
        linhas: [],
        status: divisionSeasonId === "div-1" ? "ativo" : "rascunho",
        encerradaParaFluxo: false,
        zonas: ZONAS_VAZIAS,
      }) as unknown as Awaited<ReturnType<typeof getDivisionStandings>>
  )
}

async function renderPage() {
  const jsx = await LigaPage({ params: Promise.resolve({ id: SEASON }) })
  return render(jsx)
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(cleanup)

describe("LigaPage — visão de leitura vs gestão", () => {
  it("gestor (podeGerir): vê links de gestão, botões de iniciar/turno e a classificação", async () => {
    montarCenario({ podeGerir: true })
    await renderPage()

    expect(screen.getByText("Equipe")).toBeInTheDocument()
    expect(screen.getByText("Identidade")).toBeInTheDocument()
    expect(screen.getByTestId("btn-iniciar")).toBeInTheDocument()
    expect(screen.getByTestId("turno")).toBeInTheDocument()
    expect(screen.getByTestId("standings")).toBeInTheDocument()
    // Vitrine (add-vitrine-publica-e-compartilhar): toggle + Compartilhar.
    expect(screen.getByText("Listar na vitrine pública")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^compartilhar$/i })
    ).toBeInTheDocument()
  })

  it("leitor (não-gestor): vê a classificação mas NENHUM controle de gestão", async () => {
    montarCenario({ user: { id: "leitor-1" }, podeGerir: false })
    await renderPage()

    // Leitura presente.
    expect(screen.getByTestId("standings")).toBeInTheDocument()
    expect(
      screen.getByText("A classificação aparecerá quando a divisão começar.")
    ).toBeInTheDocument()
    // Gestão ausente.
    expect(screen.queryByText("Equipe")).toBeNull()
    expect(screen.queryByText("Identidade")).toBeNull()
    expect(screen.queryByTestId("btn-iniciar")).toBeNull()
    expect(screen.queryByTestId("turno")).toBeNull()
    expect(screen.queryByTestId("fluxo")).toBeNull()
    // Vitrine: nem toggle nem Compartilhar para o leitor.
    expect(screen.queryByText("Listar na vitrine pública")).toBeNull()
    expect(screen.queryByRole("button", { name: /^compartilhar$/i })).toBeNull()
  })

  it("não-logado: redireciona para o login (não renderiza)", async () => {
    montarCenario({ user: null })
    await expect(renderPage()).rejects.toThrow(/NEXT_REDIRECT/)
    expect(mockRedirect).toHaveBeenCalledWith(
      `/login?redirectTo=/dashboard/ligas/${SEASON}`
    )
    // Sem sessão, nem chega a carregar a temporada.
    expect(mockGetSeason).not.toHaveBeenCalled()
  })
})
