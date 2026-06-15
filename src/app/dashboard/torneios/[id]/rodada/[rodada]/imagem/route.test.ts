import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/match/data/getPartidasDaRodada", () => ({
  getPartidasDaRodada: vi.fn(async () => []),
}))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  resolverCoresTorneio: vi.fn(async () => ({ primaria: null, secundaria: null })),
}))
vi.mock("@/features/og/rodada", () => ({
  renderRodadaOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/torneios/[id]/rodada/[rodada]/imagem/route"
import { renderRodadaOg } from "@/features/og/rodada"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRender = vi.mocked(renderRodadaOg)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

function mockClient(cfg: { user?: { id: string } | null; torneio?: unknown }) {
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: cfg.user ?? null } })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: cfg.torneio ?? null })),
          })),
        })),
      })),
    })),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
}

const req = () => new Request("http://x")
const ctx = (id: string, rodada: string) => ({ params: Promise.resolve({ id, rodada }) })

beforeEach(() => vi.clearAllMocks())

describe("GET imagem da rodada", () => {
  it("rodada inválida → 400", async () => {
    mockClient({ user: { id: DONO } })
    expect((await GET(req(), ctx(TORNEIO, "0"))).status).toBe(400)
    expect((await GET(req(), ctx(TORNEIO, "abc"))).status).toBe(400)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("sem sessão → 404", async () => {
    mockClient({ user: null })
    expect((await GET(req(), ctx(TORNEIO, "1"))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("não-dono (torneio não encontrado) → 404", async () => {
    mockClient({ user: { id: DONO }, torneio: null })
    expect((await GET(req(), ctx(TORNEIO, "1"))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("dono → renderiza a imagem", async () => {
    mockClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, titulo: "Copa", cor_primaria: null, cor_secundaria: null },
    })
    const res = await GET(req(), ctx(TORNEIO, "3"))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][0]).toMatchObject({ titulo: "Copa", rodada: 3 })
  })
})
