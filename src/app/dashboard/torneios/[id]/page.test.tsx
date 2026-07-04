// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Guard de INTEGRAÇÃO da página do torneio (lição do change: ClubesStep e
// VagasSection nasceram implementados porém ÓRFÃOS — nunca renderizados).
// Os blocos pesados/cliente são neutralizados; os ALVOS (VagasSection e
// ParticipantsSection, com suas folhas mockadas) renderizam de verdade.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
// Capacidades da equipe (change add-equipe-campeonato): a página deriva
// gerir/arbitrar/moderar do app-layer. Mockadas como vi.fn() — `montarCenario`
// ajusta o retorno conforme o cenário (dono = todas; visitante = nenhuma).
vi.mock("@/lib/autorizacao", () => ({
  podeGerir: vi.fn(async () => true),
  podeArbitrar: vi.fn(async () => true),
  podeModerar: vi.fn(async () => true),
  podeVerBastidores: vi.fn(async () => true),
}))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: vi.fn(),
  // Cores (change add-cores-campeonato): default tema base — não tematiza, as
  // asserções de layout/seções seguem válidas.
  resolverCoresTorneio: vi.fn(async () => ({ primaria: null, secundaria: null })),
}))
// Folhas client da vitrine (add-vitrine-publica-e-compartilhar): neutralizadas
// (usam useRouter/Web Share — fora do alvo). Stubs com texto/role identificáveis
// para as asserções de GATING (presença/ausência por gestor e por divisão). O
// comportamento real vive nos testes de componente dedicados.
vi.mock("@/features/discovery/components/ListarVitrineToggle", () => ({
  ListarVitrineToggle: () => <span>Listar na vitrine pública</span>,
}))
vi.mock("@/features/discovery/components/CompartilharCompetitionButton", () => ({
  CompartilharCompetitionButton: () => <button>Compartilhar</button>,
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
vi.mock("@/features/match/data/getPropostasPendentes", () => ({
  getPropostasPendentes: vi.fn(async () => []),
}))
vi.mock("@/features/match/components/PropostasPendentes", () => ({
  PropostasPendentes: () => null,
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
import { podeArbitrar, podeGerir, podeModerar } from "@/lib/autorizacao"

const mockCreateClient = vi.mocked(createClient)
const mockGerir = vi.mocked(podeGerir)
const mockArbitrar = vi.mocked(podeArbitrar)
const mockModerar = vi.mocked(podeModerar)
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
    listada: false,
    pontos_vitoria: 3,
    pontos_empate: 1,
    pontos_derrota: 0,
    ...over,
  }
}

function montarCenario(c: {
  user?: { id: string } | null
  torneio?: Record<string, unknown>
  /** Retorno da RPC `liga_do_torneio`: uuid da liga-mãe (divisão) ou null
   * (avulso/raiz). Default null = NÃO é divisão (comportamento existente). */
  ligaDoTorneio?: string | null
  /** season_id devolvido pela query de `league_division_seasons` (link "Ver
   * liga"). Default null = não resolve → sem link. */
  divisionSeasonId?: string | null
}) {
  // Cadeia mínima para a query de barragem 'pares' (esconde "Avançar fase");
  // retorna { data: null } → não-barragem, preserva o comportamento existente.
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null }),
  }
  // Cadeia dedicada da resolução do season_id da divisão (add-liga-visao-leitura).
  const divChain: Record<string, unknown> = {
    select: () => divChain,
    or: () => divChain,
    maybeSingle: async () => ({
      data: c.divisionSeasonId ? { season_id: c.divisionSeasonId } : null,
    }),
  }
  const user = c.user ?? { id: DONO }
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: vi.fn((table: string) =>
      table === "league_division_seasons" ? divChain : chain
    ),
    // `liga_do_torneio` define `ehDivisao`: não-nulo esconde o link "Equipe".
    rpc: vi.fn(async () => ({ data: c.ligaDoTorneio ?? null, error: null })),
  } as unknown as never)
  // Capacidades = posse no modelo do teste: o DONO (created_by) tem todas; o
  // visitante, nenhuma. A page deriva gerir/arbitrar/moderar daqui.
  const ehDono = user.id === DONO
  mockGerir.mockResolvedValue(ehDono)
  mockArbitrar.mockResolvedValue(ehDono)
  mockModerar.mockResolvedValue(ehDono)
  mockClassificacao.mockResolvedValue({
    torneio: torneioBase(c.torneio),
    linhas: [],
    partidasEncerradas: [],
    clubes: [],
    partidasAbertas: [],
    chave: [],
    grupos: [],
    rodadaAtiva: null,
    rodadasLiberacao: [],
    proximaRodadaOculta: null,
  } as unknown as Awaited<ReturnType<typeof getTournamentClassificacao>>)
}

async function renderPage() {
  const jsx = await TorneioPage({ params: Promise.resolve({ id: TORNEIO }) })
  return render(jsx)
}

/** As seções agora vivem em ABAS (change add-torneio-abas-passador): o conteúdo
 * de uma aba inativa NÃO está no DOM. Ativa a aba pelo seu rótulo antes de checar
 * o conteúdo. userEvent (não fireEvent) — a ativação do Radix Tabs depende de
 * foco/pointer reais, que o fireEvent.click não dispara no jsdom. */
async function ativarAba(nome: string | RegExp) {
  await userEvent.click(screen.getByRole("tab", { name: nome }))
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
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null, porNome: false },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null, porNome: false },
    ])
    await renderPage()
    await ativarAba("Vagas")
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
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null, porNome: false },
    ])
    await renderPage()
    await ativarAba("Vagas")
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
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null, porNome: false },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null, porNome: false },
      { id: "s3", clube: "Bahia", escudoUrl: null, tecnico: null, porNome: false },
    ])
    await renderPage()
    expect(screen.getByTestId("painel-liga")).toHaveAttribute("data-qtd", "3")
  })

  it("painel do MATA-MATA recebe as vagas como lados (clube como rótulo)", async () => {
    montarCenario({ torneio: { formato: "mata_mata", status: "rascunho" } })
    mockVagas.mockResolvedValue([
      { id: "s1", clube: "Grêmio", escudoUrl: null, tecnico: null, porNome: false },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null, porNome: false },
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
    await ativarAba("Participantes")
    expect(
      screen.getByRole("heading", { name: "Participantes" })
    ).toBeInTheDocument()
    expect(screen.getByTestId("convite-generico")).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Vagas" })).toBeNull()
    expect(mockVagas).not.toHaveBeenCalled()
    expect(mockCodigos).not.toHaveBeenCalled()
  })
})

describe("TorneioPage — liberação de rodadas (change add-liberacao-rodadas)", () => {
  it("NÃO-DONO em torneio ATIVO sem nada liberado vê o aviso (não os empty-states)", async () => {
    montarCenario({
      user: { id: "visitante" },
      torneio: { formato: "liga", status: "ativo" },
    })
    await renderPage()
    expect(screen.getByText(/ainda não foram liberadas/i)).toBeInTheDocument()
    // o empty-state de "não iniciado" da classificação NÃO aparece
    expect(
      screen.queryByText(/depois da primeira partida encerrada/i)
    ).toBeNull()
  })

  it("AVULSO público vazio (não-dono) NÃO dispara o aviso de liberação", async () => {
    montarCenario({
      user: { id: "visitante" },
      torneio: { formato: "avulso", status: "ativo" },
    })
    await renderPage()
    expect(screen.queryByText(/ainda não foram liberadas/i)).toBeNull()
  })

  it("DONO de torneio gerado com rodada oculta vê a seção 'Liberação de rodadas'", async () => {
    montarCenario({ torneio: { formato: "liga", status: "ativo" } })
    mockClassificacao.mockResolvedValue({
      torneio: torneioBase({ formato: "liga", status: "ativo" }),
      linhas: [],
      partidasEncerradas: [],
      clubes: [],
      partidasAbertas: [],
      chave: [],
      grupos: [],
      rodadaAtiva: 1,
      rodadasLiberacao: [{ rodada: 1, total: 2, liberada: false }],
      proximaRodadaOculta: 1,
    } as unknown as Awaited<ReturnType<typeof getTournamentClassificacao>>)
    await renderPage()
    await ativarAba("Rodadas")
    expect(
      screen.getByRole("heading", { name: "Liberação de rodadas" })
    ).toBeInTheDocument()
    expect(screen.getByText("Liberar próxima rodada")).toBeInTheDocument()
  })

  it("NÃO-DONO não vê a seção 'Liberação de rodadas'", async () => {
    montarCenario({
      user: { id: "visitante" },
      torneio: { formato: "liga", status: "ativo" },
    })
    mockClassificacao.mockResolvedValue({
      torneio: torneioBase({ formato: "liga", status: "ativo" }),
      linhas: [],
      partidasEncerradas: [],
      clubes: [],
      partidasAbertas: [],
      chave: [],
      grupos: [],
      rodadaAtiva: 1,
      rodadasLiberacao: [{ rodada: 1, total: 2, liberada: false }],
      proximaRodadaOculta: 1,
    } as unknown as Awaited<ReturnType<typeof getTournamentClassificacao>>)
    await renderPage()
    expect(
      screen.queryByRole("heading", { name: "Liberação de rodadas" })
    ).toBeNull()
  })
})

describe("TorneioPage — link 'Equipe' por tipo de torneio (must_fix divisão)", () => {
  const LIGA_MAE = "22222222-2222-4222-8222-222222222222"

  it("torneio RAIZ (não-divisão): dono vê o link 'Equipe' na Administração", async () => {
    montarCenario({ torneio: { formato: "liga", status: "ativo" } })
    await renderPage()
    const equipe = screen.getByRole("link", { name: /equipe/i })
    expect(equipe).toHaveAttribute("href", `/dashboard/torneios/${TORNEIO}/equipe`)
  })

  it("torneio de DIVISÃO (liga_do_torneio não-nulo): link 'Equipe' é OCULTO", async () => {
    montarCenario({
      torneio: { formato: "liga", status: "ativo" },
      ligaDoTorneio: LIGA_MAE,
    })
    await renderPage()
    expect(screen.queryByRole("link", { name: /equipe/i })).toBeNull()
  })
})

describe("TorneioPage — link 'Ver liga' da divisão (add-liga-visao-leitura)", () => {
  const LIGA_MAE = "22222222-2222-4222-8222-222222222222"
  const SEASON = "44444444-4444-4444-8444-444444444444"

  it("divisão com season resolvida: link 'Ver liga' aponta para a temporada", async () => {
    montarCenario({
      torneio: { formato: "liga", status: "ativo" },
      ligaDoTorneio: LIGA_MAE,
      divisionSeasonId: SEASON,
    })
    await renderPage()
    const verLiga = screen.getByRole("link", { name: /ver liga/i })
    expect(verLiga).toHaveAttribute("href", `/dashboard/ligas/${SEASON}`)
  })

  it("LEITOR (não-gestor) de uma divisão também vê o 'Ver liga'", async () => {
    montarCenario({
      user: { id: "leitor-1" },
      torneio: { formato: "liga", status: "ativo" },
      ligaDoTorneio: LIGA_MAE,
      divisionSeasonId: SEASON,
    })
    await renderPage()
    expect(screen.getByRole("link", { name: /ver liga/i })).toHaveAttribute(
      "href",
      `/dashboard/ligas/${SEASON}`
    )
  })

  it("torneio AVULSO (não-divisão): sem link 'Ver liga'", async () => {
    montarCenario({ torneio: { formato: "liga", status: "ativo" } })
    await renderPage()
    expect(screen.queryByRole("link", { name: /ver liga/i })).toBeNull()
  })
})

describe("TorneioPage — vitrine: toggle + compartilhar (add-vitrine-publica-e-compartilhar)", () => {
  const LIGA_MAE = "22222222-2222-4222-8222-222222222222"

  it("gestor de torneio de TOPO vê o toggle e o botão Compartilhar", async () => {
    montarCenario({ torneio: { formato: "liga", status: "ativo" } })
    await renderPage()
    expect(screen.getByText("Listar na vitrine pública")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /^compartilhar$/i })
    ).toBeInTheDocument()
  })

  it("gestor de DIVISÃO: sem toggle (a liga-mãe é quem se lista), mas com Compartilhar", async () => {
    montarCenario({
      torneio: { formato: "liga", status: "ativo" },
      ligaDoTorneio: LIGA_MAE,
    })
    await renderPage()
    expect(screen.queryByText("Listar na vitrine pública")).toBeNull()
    expect(
      screen.getByRole("button", { name: /^compartilhar$/i })
    ).toBeInTheDocument()
  })

  it("não-gestor: sem toggle e sem Compartilhar", async () => {
    montarCenario({
      user: { id: "leitor-1" },
      torneio: { formato: "liga", status: "ativo" },
    })
    await renderPage()
    expect(screen.queryByText("Listar na vitrine pública")).toBeNull()
    expect(screen.queryByRole("button", { name: /^compartilhar$/i })).toBeNull()
  })
})

describe("TorneioPage — composição dinâmica das abas (change add-torneio-abas-passador)", () => {
  function classificacaoCom(over: Record<string, unknown>) {
    mockClassificacao.mockResolvedValue({
      torneio: torneioBase({ formato: "liga", status: "ativo" }),
      linhas: [],
      partidasEncerradas: [],
      clubes: [],
      partidasAbertas: [],
      chave: [],
      grupos: [],
      rodadaAtiva: null,
      rodadasLiberacao: [],
      proximaRodadaOculta: null,
      ...over,
    } as unknown as Awaited<ReturnType<typeof getTournamentClassificacao>>)
  }

  it("liga ativo (dono) com partidas e cadência: 4 abas na ordem certa", async () => {
    montarCenario({ torneio: { formato: "liga", status: "ativo" } })
    classificacaoCom({
      partidasAbertas: [{ id: "m1", rodada: 1, grupo: null }],
      rodadaAtiva: 1,
      rodadasLiberacao: [{ rodada: 1, total: 2, liberada: false }],
      proximaRodadaOculta: 1,
    })
    await renderPage()
    // O rótulo agora tem span curto (aria-hidden) + completo (sr-only): o
    // textContent concatena ("Class.Classificação"), então asserta por
    // accessible name, na ordem das abas.
    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(4)
    for (const [i, nome] of [
      "Classificação",
      "Partidas",
      "Rodadas",
      "Vagas",
    ].entries()) {
      expect(tabs[i]).toHaveAccessibleName(new RegExp(nome))
    }
    // Classificação é o padrão (aba ativa inicial).
    expect(screen.getByRole("tab", { name: "Classificação" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
  })

  it("espectador (não-dono) sem cadência: sem aba Rodadas", async () => {
    montarCenario({
      user: { id: "visitante" },
      torneio: { formato: "liga", status: "ativo" },
    })
    classificacaoCom({
      partidasAbertas: [{ id: "m1", rodada: 1, grupo: null }],
      rodadaAtiva: 1,
    })
    await renderPage()
    expect(screen.queryByRole("tab", { name: "Rodadas" })).toBeNull()
    expect(screen.getByRole("tab", { name: "Classificação" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Partidas" })).toBeInTheDocument()
  })

  it("avulso: aba Participantes (não Vagas) e sem Rodadas", async () => {
    montarCenario({ torneio: { formato: "avulso", status: "ativo" } })
    mockParticipantes.mockResolvedValue([{ id: DONO, nome: "Ana", avatar: null }])
    await renderPage()
    expect(screen.getByRole("tab", { name: "Participantes" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Vagas" })).toBeNull()
    expect(screen.queryByRole("tab", { name: "Rodadas" })).toBeNull()
  })
})
