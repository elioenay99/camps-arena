import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import {
  getCodigosDasVagas,
  getVagasDoTorneio,
} from "@/features/tournament/data/getVagasDoTorneio"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

/** Cliente falso: from().select().eq().order()? → {data,error}. */
function montarClient(c: Cenario) {
  const selectSpy = vi.fn()
  const filtroSpy = vi.fn()
  const orderSpy = vi.fn()
  const resposta = () =>
    Promise.resolve({ data: c.data ?? null, error: c.error ?? null })
  const builder = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroSpy("eq", col, val)
      return builder
    }),
    order: vi.fn((col: string, opts: unknown) => {
      orderSpy(col, opts)
      return resposta()
    }),
    // getCodigosDasVagas dá await direto após .eq() (sem order).
    then: (resolve: (v: unknown) => unknown) => resposta().then(resolve),
  }
  const client = {
    from: vi.fn(() => ({
      select: vi.fn((cols: string) => {
        selectSpy(cols)
        return builder
      }),
    })),
    selectSpy,
    filtroSpy,
    orderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("getVagasDoTorneio", () => {
  it("resolve clube/escudo/técnico dos embeds, filtrando pelo torneio", async () => {
    const client = montarClient({
      data: [
        {
          id: "s1",
          clube: { nome: "Grêmio", escudo_url: "https://media.api-sports.io/football/teams/130.png" },
          tecnico: { id: "u1", nome: "Ana" },
        },
        // Vaga órfã (clube sem técnico) e técnico sem nome.
        { id: "s2", clube: { nome: "Inter", escudo_url: null }, tecnico: null },
        { id: "s3", clube: { nome: "Bahia", escudo_url: null }, tecnico: { id: "u3", nome: null } },
      ],
    })

    const r = await getVagasDoTorneio(TORNEIO)

    expect(r).toEqual([
      {
        id: "s1",
        clube: "Grêmio",
        escudoUrl: "https://media.api-sports.io/football/teams/130.png",
        tecnico: { id: "u1", nome: "Ana" },
      },
      { id: "s2", clube: "Inter", escudoUrl: null, tecnico: null },
      { id: "s3", clube: "Bahia", escudoUrl: null, tecnico: { id: "u3", nome: null } },
    ])
    expect(client.from).toHaveBeenCalledWith("tournament_slots")
    expect(client.filtroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
    // Ordem de ENTRADA (estável) — não reordena conforme o técnico troca.
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", { ascending: true })
  })

  it("clube sem nome (embed nulo ou em branco) ganha o fallback 'Clube'", async () => {
    montarClient({
      data: [
        { id: "s1", clube: null, tecnico: null },
        { id: "s2", clube: { nome: "  ", escudo_url: null }, tecnico: null },
      ],
    })
    const r = await getVagasDoTorneio(TORNEIO)
    expect(r.map((v) => v.clube)).toEqual(["Clube", "Clube"])
  })

  it("embed do técnico seleciona só id/nome — sem celular (PII)", async () => {
    const client = montarClient({ data: [] })
    await getVagasDoTorneio(TORNEIO)
    const select = client.selectSpy.mock.calls[0][0] as string
    expect(select).toContain("teams!tournament_slots_team_id_fkey")
    expect(select).toContain("users!tournament_slots_user_id_fkey")
    expect(select).not.toContain("celular")
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    expect(await getVagasDoTorneio(TORNEIO)).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getVagasDoTorneio(TORNEIO)).rejects.toThrow(
      /Falha ao carregar as vagas/
    )
  })
})

describe("getCodigosDasVagas", () => {
  it("monta o mapa slot_id → code filtrando pelo torneio via embed inner", async () => {
    const client = montarClient({
      data: [
        { slot_id: "s1", code: "aaaaaaaaaaaaaaaa" },
        { slot_id: "s2", code: "bbbbbbbbbbbbbbbb" },
      ],
    })

    const r = await getCodigosDasVagas(TORNEIO)

    expect(r.get("s1")).toBe("aaaaaaaaaaaaaaaa")
    expect(r.get("s2")).toBe("bbbbbbbbbbbbbbbb")
    expect(r.size).toBe(2)
    expect(client.from).toHaveBeenCalledWith("slot_invites")
    // O filtro de torneio se aplica ao embed INNER (slot.tournament_id).
    expect(client.filtroSpy).toHaveBeenCalledWith(
      "eq",
      "slot.tournament_id",
      TORNEIO
    )
    const select = client.selectSpy.mock.calls[0][0] as string
    expect(select).toContain("tournament_slots!slot_invites_slot_id_fkey!inner")
  })

  it("retorna mapa vazio quando data é null", async () => {
    montarClient({ data: null })
    const r = await getCodigosDasVagas(TORNEIO)
    expect(r.size).toBe(0)
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getCodigosDasVagas(TORNEIO)).rejects.toThrow(
      /Falha ao carregar os convites das vagas/
    )
  })
})
