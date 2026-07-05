import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/og/temporada", () => ({
  renderTemporadaOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/ligas/[id]/temporada/[seasonId]/imagem/route"
import { renderTemporadaOg } from "@/features/og/temporada"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRender = vi.mocked(renderTemporadaOg)

const LIGA = "11111111-1111-4111-8111-111111111111"
const SEASON = "33333333-3333-4333-8333-333333333333"
const DONO = "22222222-2222-4222-8222-222222222222"

interface Cfg {
  user?: { id: string } | null
  season?: unknown
  trofeus?: unknown[]
  comps?: unknown[]
}

function mockClient(cfg: Cfg) {
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: cfg.user ?? null } })) },
    from: vi.fn((table: string) => {
      if (table === "league_seasons") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cfg.season ?? null }) }) }),
        }
      }
      if (table === "conquistas") {
        return { select: () => ({ eq: () => ({ eq: async () => ({ data: cfg.trofeus ?? [] }) }) }) }
      }
      if (table === "league_competitors") {
        return { select: () => ({ in: async () => ({ data: cfg.comps ?? [] }) }) }
      }
      throw new Error(`tabela inesperada: ${table}`)
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
}

const req = () => new Request("http://x")
const ctx = (id: string, seasonId: string) => ({ params: Promise.resolve({ id, seasonId }) })

const seasonDoDono = {
  numero: 3,
  competition_id: LIGA,
  league_competitions: { id: LIGA, nome: "Brasileirão", created_by: DONO },
}

beforeEach(() => vi.clearAllMocks())

describe("GET pôster de temporada encerrada", () => {
  it("sem sessão → 404", async () => {
    mockClient({ user: null })
    expect((await GET(req(), ctx(LIGA, SEASON))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("temporada inexistente → 404", async () => {
    mockClient({ user: { id: DONO }, season: null })
    expect((await GET(req(), ctx(LIGA, SEASON))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("não-dono → 404", async () => {
    mockClient({
      user: { id: "outro" },
      season: seasonDoDono,
    })
    expect((await GET(req(), ctx(LIGA, SEASON))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("id da URL não bate com a competição da season → 404 (sem vazar)", async () => {
    mockClient({ user: { id: DONO }, season: seasonDoDono })
    expect((await GET(req(), ctx("liga-errada", SEASON))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("dono: monta o pôster com campeão da elite + promovidos/rebaixados resolvidos", async () => {
    mockClient({
      user: { id: DONO },
      season: seasonDoDono,
      trofeus: [
        { tipo: "campeao", nivel: 1, competitor_id: "CH" },
        { tipo: "promovido", nivel: 2, competitor_id: "P1" },
        { tipo: "rebaixado", nivel: 1, competitor_id: "R1" },
      ],
      comps: [
        { id: "CH", rotulo: null, team: { nome: "Flamengo", escudo_url: "u/ch.png" } },
        { id: "P1", rotulo: "Coringão", team: null },
        { id: "R1", rotulo: null, team: { nome: "Vasco", escudo_url: null } },
      ],
    })

    const res = await GET(req(), ctx(LIGA, SEASON))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledOnce()
    const arg = mockRender.mock.calls[0][0]
    expect(arg.titulo).toBe("Brasileirão — Temporada 3")
    expect(arg.campeao).toEqual({ nome: "Flamengo", escudoUrl: "u/ch.png" })
    expect(arg.subiram).toEqual([{ nome: "Coringão", escudoUrl: null }])
    expect(arg.cairam).toEqual([{ nome: "Vasco", escudoUrl: null }])
  })
})
