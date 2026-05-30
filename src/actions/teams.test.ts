import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { searchTeams, selectTeam } from "@/actions/teams"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

// ----------------------------- searchTeams -----------------------------

describe("searchTeams", () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch)
    vi.stubEnv("API_FOOTBALL_KEY", "test-key")
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("não chama a API para termo com menos de 3 caracteres", async () => {
    const r = await searchTeams("ab")
    expect(r).toEqual({ ok: true, teams: [] })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("falha sem a chave da API (sem vazar detalhe)", async () => {
    vi.stubEnv("API_FOOTBALL_KEY", "")
    const r = await searchTeams("flamengo")
    expect(r.ok).toBe(false)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("normaliza clubes e envia a chave no header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: [
          {
            team: {
              id: 33,
              name: "Manchester United",
              logo: "https://media.api-sports.io/football/teams/33.png",
            },
          },
          { team: { id: 127, name: "Flamengo", logo: null } },
        ],
      }),
    })

    const r = await searchTeams("man")
    expect(r).toEqual({
      ok: true,
      teams: [
        {
          externalId: "33",
          nome: "Manchester United",
          escudoUrl: "https://media.api-sports.io/football/teams/33.png",
        },
        { externalId: "127", nome: "Flamengo", escudoUrl: null },
      ],
    })
    const [url, init] = mockFetch.mock.calls[0]
    expect(String(url)).toContain("search=man")
    expect(init.headers).toMatchObject({ "x-apisports-key": "test-key" })
  })

  it("retorna erro em falha de rede", async () => {
    mockFetch.mockRejectedValue(new Error("network"))
    const r = await searchTeams("flamengo")
    expect(r.ok).toBe(false)
  })

  it("retorna erro em HTTP não-ok", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    const r = await searchTeams("flamengo")
    expect(r.ok).toBe(false)
  })

  it("não falha quando a API responde 200 com errors (cota/chave) — lista vazia", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ errors: { requests: "limite diário" }, response: [] }),
    })
    const r = await searchTeams("flamengo")
    expect(r).toEqual({ ok: true, teams: [] })
  })

  it("retorna erro quando o JSON da resposta é inválido", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json")
      },
    })
    const r = await searchTeams("flamengo")
    expect(r.ok).toBe(false)
  })

  it("descarta itens malformados do payload (filtragem defensiva)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        response: [
          {},
          { team: { id: 1 } }, // sem name
          { team: { name: "Sem ID" } }, // sem id
          { team: { id: 99, name: "Válido", logo: null } },
        ],
      }),
    })
    const r = await searchTeams("flamengo")
    expect(r).toEqual({
      ok: true,
      teams: [{ externalId: "99", nome: "Válido", escudoUrl: null }],
    })
  })
})

// ----------------------------- selectTeam ------------------------------

interface TeamsCenario {
  user?: { id: string } | null
}

function montarTeamsClient(c: TeamsCenario) {
  const insertSpy = vi.fn()
  const maybeSingle = vi.fn()
  const single = vi.fn()
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: c.user ?? null }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
      insert: vi.fn((vals: unknown) => {
        insertSpy(vals)
        return { select: vi.fn(() => ({ single })) }
      }),
    })),
    insertSpy,
    maybeSingle,
    single,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

const CLUBE = {
  externalId: "33",
  nome: "Manchester United",
  escudoUrl: "https://media.api-sports.io/football/teams/33.png",
}

describe("selectTeam", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rejeita entrada inválida", async () => {
    const r = await selectTeam({ externalId: "", nome: "", escudoUrl: null })
    expect(r.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("rejeita usuário não autenticado", async () => {
    const client = montarTeamsClient({ user: null })
    const r = await selectTeam(CLUBE)
    expect(r.ok).toBe(false)
    expect(client.insertSpy).not.toHaveBeenCalled()
  })

  it("reutiliza o clube já cacheado (sem inserir)", async () => {
    const client = montarTeamsClient({ user: { id: "u1" } })
    client.maybeSingle.mockResolvedValue({ data: { id: "t-existente" }, error: null })
    const r = await selectTeam(CLUBE)
    expect(r).toEqual({ ok: true, teamId: "t-existente" })
    expect(client.insertSpy).not.toHaveBeenCalled()
  })

  it("insere o clube novo e retorna o id", async () => {
    const client = montarTeamsClient({ user: { id: "u1" } })
    client.maybeSingle.mockResolvedValue({ data: null, error: null })
    client.single.mockResolvedValue({ data: { id: "t-novo" }, error: null })
    const r = await selectTeam(CLUBE)
    expect(r).toEqual({ ok: true, teamId: "t-novo" })
    expect(client.insertSpy).toHaveBeenCalledWith({
      nome: "Manchester United",
      escudo_url: "https://media.api-sports.io/football/teams/33.png",
      external_id: "33",
      provider: "api-football",
    })
  })

  it("trata corrida: insert falha por duplicidade → relê o existente", async () => {
    const client = montarTeamsClient({ user: { id: "u1" } })
    client.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // 1ª checagem
      .mockResolvedValueOnce({ data: { id: "t-corrida" }, error: null }) // re-leitura
    client.single.mockResolvedValue({ data: null, error: { message: "duplicate key" } })
    const r = await selectTeam(CLUBE)
    expect(r).toEqual({ ok: true, teamId: "t-corrida" })
    expect(client.insertSpy).toHaveBeenCalled() // a corrida pressupõe tentativa de insert
  })

  it("falha quando o insert dá erro e a releitura não acha (erro de persistência)", async () => {
    const client = montarTeamsClient({ user: { id: "u1" } })
    client.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    client.single.mockResolvedValue({ data: null, error: { message: "rls" } })
    const r = await selectTeam(CLUBE)
    expect(r.ok).toBe(false)
    expect(client.insertSpy).toHaveBeenCalled()
  })
})
