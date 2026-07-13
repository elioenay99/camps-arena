import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/standings/data/getTournamentClassificacao", () => ({
  getTournamentClassificacao: vi.fn(),
  resolverCoresTorneio: vi.fn(async () => ({ primaria: null, secundaria: null })),
}))
vi.mock("@/features/og/classificacao", () => ({
  renderClassificacaoOg: vi.fn(async () => new Response("png", { status: 200 })),
}))

import { GET } from "@/app/dashboard/torneios/[id]/classificacao/imagem/route"
import { renderClassificacaoOg } from "@/features/og/classificacao"
import { getTournamentClassificacao } from "@/features/standings/data/getTournamentClassificacao"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockGet = vi.mocked(getTournamentClassificacao)
const mockRender = vi.mocked(renderClassificacaoOg)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const USER = "22222222-2222-4222-8222-222222222222"

function mockClient(user: { id: string } | null) {
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as unknown as never)
}

function classificacao(formato: string) {
  return {
    torneio: {
      id: TORNEIO,
      titulo: "Liga da Firma",
      formato,
      cor_primaria: null,
      cor_secundaria: null,
    },
    linhas: [{ participanteId: "a", nome: "Alfa", posicao: 1 }],
  }
}

const req = () => new Request("http://x")
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => vi.clearAllMocks())

describe("GET imagem da classificação (torneio de liga)", () => {
  it("sem sessão → 404", async () => {
    mockClient(null)
    expect((await GET(req(), ctx(TORNEIO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("torneio invisível/inexistente → 404", async () => {
    mockClient({ id: USER })
    mockGet.mockResolvedValue(null)
    expect((await GET(req(), ctx(TORNEIO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("formato de grupos → 404 (fora do escopo desta change)", async () => {
    mockClient({ id: USER })
    mockGet.mockResolvedValue(classificacao("grupos_mata_mata") as never)
    expect((await GET(req(), ctx(TORNEIO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("mata-mata → 404 (só liga tem tabela única)", async () => {
    mockClient({ id: USER })
    mockGet.mockResolvedValue(classificacao("mata_mata") as never)
    expect((await GET(req(), ctx(TORNEIO))).status).toBe(404)
    expect(mockRender).not.toHaveBeenCalled()
  })

  it("liga visível → renderiza", async () => {
    mockClient({ id: USER })
    mockGet.mockResolvedValue(classificacao("liga") as never)
    const res = await GET(req(), ctx(TORNEIO))
    expect(res.status).toBe(200)
    expect(mockRender).toHaveBeenCalledTimes(1)
    expect(mockRender.mock.calls[0][0]).toMatchObject({ titulo: "Liga da Firma" })
  })
})
