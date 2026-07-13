import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/league/data/getSeason", () => ({ getSeason: vi.fn() }))
vi.mock("@/features/league/data/getDivisionStandings", () => ({
  getDivisionStandings: vi.fn(),
}))
vi.mock("@/features/og/classificacao", () => ({
  renderClassificacaoOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/ligas/[id]/temporada/[seasonId]/divisao/[divisionSeasonId]/imagem/route"
import { getDivisionStandings } from "@/features/league/data/getDivisionStandings"
import { getSeason } from "@/features/league/data/getSeason"
import { renderClassificacaoOg } from "@/features/og/classificacao"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockSeason = vi.mocked(getSeason)
const mockStandings = vi.mocked(getDivisionStandings)
const mockRender = vi.mocked(renderClassificacaoOg)

const COMP = "11111111-1111-4111-8111-111111111111"
const OUTRO = "99999999-9999-4999-8999-999999999999"
const SEASON = "44444444-4444-4444-8444-444444444444"
const DIV = "55555555-5555-4555-8555-555555555555"
const USER = "22222222-2222-4222-8222-222222222222"

function mockClient(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as never)
}

function temporada(over: Record<string, unknown> = {}) {
  return {
    seasonId: SEASON,
    competicao: {
      id: COMP,
      nome: "Pirâmide",
      corPrimaria: null,
      corSecundaria: null,
    },
    divisoes: [{ id: DIV, nivel: 1, nome: "Série A", corPrimaria: null, corSecundaria: null }],
    fronteiras: [],
    ...over,
  }
}

const req = () => new Request("http://x")
const ctx = (id: string, seasonId: string, divisionSeasonId: string) => ({
  params: Promise.resolve({ id, seasonId, divisionSeasonId }),
})

beforeEach(() => vi.clearAllMocks())

describe("GET imagem da classificação (divisão de pirâmide)", () => {
  it("sem sessão → 404", async () => {
    mockClient(null)
    expect((await GET(req(), ctx(COMP, SEASON, DIV))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("temporada invisível → 404", async () => {
    mockClient({ id: USER })
    mockSeason.mockResolvedValue(null)
    expect((await GET(req(), ctx(COMP, SEASON, DIV))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("competição da URL diverge da temporada → 404", async () => {
    mockClient({ id: USER })
    mockSeason.mockResolvedValue(temporada() as never)
    expect((await GET(req(), ctx(OUTRO, SEASON, DIV))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("divisão inexistente na temporada → 404", async () => {
    mockClient({ id: USER })
    mockSeason.mockResolvedValue(temporada({ divisoes: [] }) as never)
    expect((await GET(req(), ctx(COMP, SEASON, DIV))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("standings null (RLS não entrega) → 404", async () => {
    mockClient({ id: USER })
    mockSeason.mockResolvedValue(temporada() as never)
    mockStandings.mockResolvedValue(null)
    expect((await GET(req(), ctx(COMP, SEASON, DIV))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("visível → renderiza com as zonas do retorno", async () => {
    mockClient({ id: USER })
    mockSeason.mockResolvedValue(temporada() as never)
    const zonas = { acesso: [1], rebaixamento: [], playoffAcesso: [], playoffRebaixamento: [] }
    mockStandings.mockResolvedValue({
      linhas: [{ participanteId: "a", nome: "Alfa", posicao: 1 }],
      zonas,
    } as never)
    const res = await GET(req(), ctx(COMP, SEASON, DIV))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][0]).toMatchObject({
      titulo: "Pirâmide — Série A",
      zonas,
    })
  })
})
