import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/match/data/getPartidaParaImagem", () => ({
  getPartidaParaImagem: vi.fn(),
}))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  resolverCoresTorneio: vi.fn(async () => ({ primaria: null, secundaria: null })),
}))
vi.mock("@/features/og/partida", () => ({
  renderPartidaOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/torneios/[id]/partida/[matchId]/imagem/route"
import { getPartidaParaImagem } from "@/features/match/data/getPartidaParaImagem"
import { renderPartidaOg } from "@/features/og/partida"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockGetPartida = vi.mocked(getPartidaParaImagem)
const mockRender = vi.mocked(renderPartidaOg)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const OUTRO = "99999999-9999-4999-8999-999999999999"
const MATCH = "33333333-3333-4333-8333-333333333333"
const USER = "22222222-2222-4222-8222-222222222222"

function mockClient(cfg: { user?: { id: string } | null; torneio?: unknown }) {
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: cfg.user ?? null } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: cfg.torneio ?? null })),
        })),
      })),
    })),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
}

function partida(over: Record<string, unknown> = {}) {
  return {
    id: MATCH,
    nome_1: "A",
    nome_2: "B",
    placar_1: 2,
    placar_2: 1,
    encerradaEm: "2026-01-01T00:00:00Z",
    rodada: 1,
    perna: null,
    grupo: null,
    escudo_1: null,
    escudo_2: null,
    wo: false,
    woVencedorLado: null,
    woDuplo: false,
    tournament_id: TORNEIO,
    avatarUrl_1: null,
    avatarUrl_2: null,
    ...over,
  }
}

const req = () => new Request("http://x")
const ctx = (id: string, matchId: string) => ({
  params: Promise.resolve({ id, matchId }),
})

beforeEach(() => vi.clearAllMocks())

describe("GET imagem do resultado", () => {
  it("sem sessão → 404", async () => {
    mockClient({ user: null })
    expect((await GET(req(), ctx(TORNEIO, MATCH))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("partida ausente/oculta pela RLS → 404", async () => {
    mockClient({ user: { id: USER } })
    mockGetPartida.mockResolvedValue(null)
    expect((await GET(req(), ctx(TORNEIO, MATCH))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("tournament_id divergente do [id] da URL → 404 (sem cor alheia)", async () => {
    mockClient({ user: { id: USER } })
    mockGetPartida.mockResolvedValue(partida({ tournament_id: OUTRO }) as never)
    expect((await GET(req(), ctx(TORNEIO, MATCH))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("torneio invisível (sem título/cores) → 404", async () => {
    mockClient({ user: { id: USER }, torneio: null })
    mockGetPartida.mockResolvedValue(partida() as never)
    expect((await GET(req(), ctx(TORNEIO, MATCH))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("logado com acesso e torneio batendo → renderiza", async () => {
    mockClient({
      user: { id: USER },
      torneio: { id: TORNEIO, titulo: "Copa", cor_primaria: null, cor_secundaria: null },
    })
    mockGetPartida.mockResolvedValue(partida() as never)
    const res = await GET(req(), ctx(TORNEIO, MATCH))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][0]).toMatchObject({ titulo: "Copa" })
  })
})
