import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/league/data/getTecnicoProfile", () => ({
  getTecnicoProfile: vi.fn(),
}))
vi.mock("@/features/league/data/getTecnicoCampanha", () => ({
  getTecnicoCampanha: vi.fn(async () => ({
    total: { jogos: 10, vitorias: 5, empates: 3, derrotas: 2, golsPro: 0, golsContra: 0, saldo: 0, aproveitamento: 60 },
    porClube: new Map(),
    adversarios: [],
  })),
}))
vi.mock("@/features/league/data/getConquistasDoTecnico", () => ({
  getConquistasDoTecnico: vi.fn(async () => []),
}))
vi.mock("@/features/og/tecnico", () => ({
  renderTecnicoOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/ligas/tecnico/[userId]/imagem/route"
import { getTecnicoProfile } from "@/features/league/data/getTecnicoProfile"
import { renderTecnicoOg } from "@/features/og/tecnico"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockProfile = vi.mocked(getTecnicoProfile)
const mockRender = vi.mocked(renderTecnicoOg)

const TECNICO = "77777777-7777-4777-8777-777777777777"
const USER = "22222222-2222-4222-8222-222222222222"

function mockClient(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as never)
}

const perfil = (clubes: unknown[]) => ({
  id: TECNICO,
  nome: "Fulano",
  avatar: null,
  clubes,
  totalClubes: clubes.length,
  totalTemporadas: clubes.length,
})

const req = () => new Request("http://x")
const ctx = (userId: string) => ({ params: Promise.resolve({ userId }) })

beforeEach(() => vi.clearAllMocks())

describe("GET imagem do pôster do técnico", () => {
  it("sem sessão → 404", async () => {
    mockClient(null)
    expect((await GET(req(), ctx(TECNICO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("perfil inexistente/ilegível → 404 sem oráculo", async () => {
    mockClient({ id: USER })
    mockProfile.mockResolvedValue(null)
    expect((await GET(req(), ctx(TECNICO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("conta real sem histórico (clubes: []) → 404 (não serve pôster de nada)", async () => {
    mockClient({ id: USER })
    mockProfile.mockResolvedValue(perfil([]) as never)
    expect((await GET(req(), ctx(TECNICO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("técnico com histórico → renderiza o pôster com a campanha", async () => {
    mockClient({ id: USER })
    mockProfile.mockResolvedValue(perfil([{ competitorId: "c1" }]) as never)
    const res = await GET(req(), ctx(TECNICO))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][0]).toMatchObject({
      nome: "Fulano",
      campanha: { jogos: 10, aproveitamento: 60 },
    })
  })
})
