// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Guard de INTEGRAÇÃO da página do torneio (lição do change: ClubesStep e
// VagasSection nasceram implementados porém ÓRFÃOS — nunca renderizados).
// Os blocos pesados/cliente são neutralizados; os ALVOS (VagasSection e
// ParticipantsSection, com suas folhas mockadas) renderizam de verdade.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: vi.fn(),
}))
vi.mock("@/features/tournament/data/getParticipantesDoTorneio", () => ({
  getParticipantesDoTorneio: vi.fn(async () => []),
}))
vi.mock("@/features/tournament/data/getConviteDoTorneio", () => ({
  getConviteDoTorneio: vi.fn(async () => null),
}))
vi.mock("@/features/tournament/data/getVagasDoTorneio", () => ({
  getVagasDoTorneio: vi.fn(async () => []),
  getCodigosDasVagas: vi.fn(async () => new Map()),
}))
// Painéis/listas client (fora do alvo): marcadores com data-testid.
vi.mock("@/features/tournament/components/IniciarTorneioPanel", () => ({
  IniciarTorneioPanel: (p: { qtdParticipantes: number }) => (
    <div data-testid="painel-liga" data-qtd={p.qtdParticipantes} />
  ),
}))
vi.mock("@/features/knockout/components/IniciarMataMataPanel", () => ({
  IniciarMataMataPanel: (p: { participantes: { id: string; nome: string | null }[] }) => (
    <div data-testid="painel-mata-mata" data-lados={p.participantes.map((x) => x.nome).join("|")} />
  ),
}))
vi.mock("@/features/groups/components/IniciarGruposPanel", () => ({
  IniciarGruposPanel: () => <div data-testid="painel-grupos" />,
}))
vi.mock("@/features/groups/components/GerarMataMataButton", () => ({
  GerarMataMataButton: () => null,
}))
vi.mock("@/features/knockout/components/AvancarFaseButton", () => ({
  AvancarFaseButton: () => null,
}))
vi.mock("@/features/knockout/components/BracketView", () => ({
  BracketView: () => null,
}))
vi.mock("@/features/match/components/MatchHistoryList", () => ({
  MatchHistoryList: () => null,
}))
vi.mock("@/features/match/components/OpenMatchesList", () => ({
  OpenMatchesList: () => null,
}))
vi.mock("@/features/match/data/getSolicitacoesWO", () => ({
  getSolicitacoesWO: vi.fn(async () => []),
}))
vi.mock("@/features/match/components/WoButtons", () => ({
  ResponderWoButtons: () => null,
}))
vi.mock("@/features/standings/components/StandingsTable", () => ({
  StandingsTable: () => null,
}))
vi.mock("@/features/tournament/components/TournamentLifecycleButtons", () => ({
  TournamentLifecycleButtons: () => null,
}))
vi.mock("@/features/tournament/components/InviteSection", () => ({
  InviteSection: () => <div data-testid="convite-generico" />,
}))
// Folhas client dos ALVOS: as seções renderizam; as actions não existem aqui.
vi.mock("@/actions/participants", () => ({
  aceitarConvite: vi.fn(),
  participarDoProprioTorneio: vi.fn(),
  sairDoTorneio: vi.fn(),
  removerParticipante: vi.fn(),
}))
vi.mock("@/actions/slots", () => ({
  aceitarConviteVaga: vi.fn(),
  assumirVagaComoDono: vi.fn(),
  desistirDaVaga: vi.fn(),
  expulsarTecnico: vi.fn(),
  regenerarConviteVaga: vi.fn(),
}))
vi.mock("@/features/team/components/TeamCrest", () => ({
  TeamCrest: () => null,
}))

import TorneioPage from "@/app/dashboard/torneios/[id]/page"
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import {
  getCodigosDasVagas,
  getVagasDoTorneio,
} from "@/features/tournament/data/getVagasDoTorneio"
import { getParticipantesDoTorneio } from "@/features/tournament/data/getParticipantesDoTorneio"
import { getConviteDoTorneio } from "@/features/tournament/data/getConviteDoTorneio"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockClassificacao = vi.mocked(getTournamentClassificacao)
const mockVagas = vi.mocked(getVagasDoTorneio)
const mockCodigos = vi.mocked(getCodigosDasVagas)
const mockParticipantes = vi.mocked(getParticipantesDoTorneio)
const mockConvite = vi.mocked(getConviteDoTorneio)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "dono-1"

function torneioBase(over: Record<string, unknown> = {}) {
  return {
    id: TORNEIO,
    titulo: "Liga dos Clubes",
    status: "rascunho",
    formato: "liga",
    ida_e_volta: false,
    terceiro_lugar: false,
    classificados_por_grupo: null,
    created_by: DONO,
    pontos_vitoria: 3,
    pontos_empate: 1,
    pontos_derrota: 0,
    ...over,
  }
}

function montarCenario(c: {
  user?: { id: string } | null
  torneio?: Record<string, unknown>
}) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: c.user ?? { id: DONO } } })) },
  } as unknown as never)
  mockClassificacao.mockResolvedValue({
    torneio: torneioBase(c.torneio),
    linhas: [],
    partidasEncerradas: [],
    clubes: [],
    partidasAbertas: [],
    chave: [],
    grupos: [],
  } as unknown as Awaited<ReturnType<typeof getTournamentClassificacao>>)
}

async function renderPage() {
  const jsx = await TorneioPage({ params: Promise.resolve({ id: TORNEIO }) })
  return render(jsx)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVagas.mockResolvedValue([])
  mockCodigos.mockResolvedValue(new Map())
  mockParticipantes.mockResolvedValue([])
  mockConvite.mockResolvedValue(null)
})
afterEach(cleanup)

describe("TorneioPage — lados por formato (integração das seções)", () => {
  it("COMPETITIVO: renderiza a seção VAGAS (não Participantes) e busca códigos só do dono", async () => {
    montarCenario({ torneio: { formato: "liga" } })
    mockVagas.mockResolvedValue([
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null },
    ])
    await renderPage()
    expect(screen.getByRole("heading", { name: "Vagas" })).toBeInTheDocument()
    expect(screen.getByText("Grêmio")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Participantes" })).toBeNull()
    expect(screen.queryByTestId("convite-generico")).toBeNull()
    // Fetch bifurcado: vagas sim; participants/convite genérico NÃO.
    expect(mockVagas).toHaveBeenCalledWith(TORNEIO)
    expect(mockCodigos).toHaveBeenCalledWith(TORNEIO)
    expect(mockParticipantes).not.toHaveBeenCalled()
    expect(mockConvite).not.toHaveBeenCalled()
  })

  it("COMPETITIVO não-dono: vagas visíveis, códigos NUNCA buscados", async () => {
    montarCenario({ user: { id: "visitante" }, torneio: { formato: "liga", status: "ativo" } })
    mockVagas.mockResolvedValue([
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null },
    ])
    await renderPage()
    expect(screen.getByRole("heading", { name: "Vagas" })).toBeInTheDocument()
    expect(mockCodigos).not.toHaveBeenCalled()
  })

  it("COMPETITIVO encerrado: dono não busca códigos (convite seria beco sem saída)", async () => {
    montarCenario({ torneio: { formato: "liga", status: "encerrado" } })
    await renderPage()
    expect(mockCodigos).not.toHaveBeenCalled()
  })

  it("painel de início da LIGA conta as VAGAS (não participants)", async () => {
    montarCenario({ torneio: { formato: "liga", status: "rascunho" } })
    mockVagas.mockResolvedValue([
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null },
      { id: "s3", clube: "Bahia", escudoUrl: null, tecnico: null },
    ])
    await renderPage()
    expect(screen.getByTestId("painel-liga")).toHaveAttribute("data-qtd", "3")
  })

  it("painel do MATA-MATA recebe as vagas como lados (clube como rótulo)", async () => {
    montarCenario({ torneio: { formato: "mata_mata", status: "rascunho" } })
    mockVagas.mockResolvedValue([
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null },
    ])
    await renderPage()
    expect(screen.getByTestId("painel-mata-mata")).toHaveAttribute(
      "data-lados",
      "Grêmio|Inter"
    )
  })

  it("AVULSO: renderiza Participantes + convite genérico; vagas NUNCA buscadas", async () => {
    montarCenario({ torneio: { formato: "avulso", status: "ativo" } })
    mockParticipantes.mockResolvedValue([{ id: DONO, nome: "Ana", avatar: null }])
    await renderPage()
    expect(
      screen.getByRole("heading", { name: "Participantes" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("convite-generico")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Vagas" })).toBeNull()
    expect(mockVagas).not.toHaveBeenCalled()
    expect(mockCodigos).not.toHaveBeenCalled()
  })
})
