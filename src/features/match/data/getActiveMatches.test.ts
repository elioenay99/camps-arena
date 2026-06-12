import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getActiveMatches } from "@/features/match/data/getActiveMatches"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const EU = "22222222-2222-4222-8222-222222222222"

interface Cenario {
  user?: { id: string } | null
  /** Linhas devolvidas pela query de partidas AVULSAS (sou participante). */
  avulsas?: unknown[] | null
  avulsasError?: { message: string } | null
  /** Ids das MINHAS vagas (subselect em tournament_slots). */
  minhasVagas?: { id: string }[] | null
  vagasError?: { message: string } | null
  /** Linhas devolvidas pela query de partidas COMPETITIVAS (minhas vagas). */
  competitivas?: unknown[] | null
  competitivasError?: { message: string } | null
}

/**
 * Cliente falso com três interações distintas (D7):
 *  - auth.getUser()                        → identidade (sessão).
 *  - from("tournament_slots").select().eq() → ids das minhas vagas.
 *  - from("matches") (2x)                   → avulsas (1ª) e competitivas (2ª),
 *    distinguidas pela ORDEM da chamada de select, espelhando a action.
 * A cadeia de matches é tolerante a is/or/neq/order em qualquer ordem; o que
 * define o dado devolvido é a sequência (1ª = avulsas, 2ª = competitivas).
 */
function montarClient(c: Cenario) {
  const selectSpy = vi.fn()
  const isSpy = vi.fn()
  const orSpy = vi.fn()
  const neqSpy = vi.fn()
  const orderSpy = vi.fn()
  const vagasEqSpy = vi.fn()
  let matchesSelectCount = 0

  const matchesFrom = {
    select: vi.fn((cols: unknown) => {
      selectSpy(cols)
      matchesSelectCount += 1
      const ehAvulsas = matchesSelectCount === 1
      const resultado = ehAvulsas
        ? { data: c.avulsas ?? null, error: c.avulsasError ?? null }
        : { data: c.competitivas ?? null, error: c.competitivasError ?? null }
      const builder: Record<string, unknown> = {}
      builder.is = vi.fn((col: string, val: unknown) => {
        isSpy(col, val)
        return builder
      })
      builder.or = vi.fn((expr: string) => {
        orSpy(expr)
        return builder
      })
      builder.neq = vi.fn((col: string, val: unknown) => {
        neqSpy(col, val)
        return builder
      })
      builder.order = vi.fn((col: string, opts: unknown) => {
        orderSpy(col, opts)
        return Promise.resolve(resultado)
      })
      return builder
    }),
  }

  const slotsFrom = {
    select: vi.fn(() => ({
      eq: vi.fn((col: string, val: unknown) => {
        vagasEqSpy(col, val)
        return Promise.resolve({
          data: c.vagasError ? null : (c.minhasVagas ?? []),
          error: c.vagasError ?? null,
        })
      }),
    })),
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user === undefined ? { id: EU } : c.user },
        error: null,
      })),
    },
    from: vi.fn((tabela: string) =>
      tabela === "tournament_slots" ? slotsFrom : matchesFrom
    ),
    selectSpy,
    isSpy,
    orSpy,
    neqSpy,
    orderSpy,
    vagasEqSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getActiveMatches", () => {
  it("retorna vazio sem sessão (defesa em profundidade) sem consultar partidas", async () => {
    const client = montarClient({ user: null })
    const r = await getActiveMatches()
    expect(r).toEqual([])
    expect(client.from).not.toHaveBeenCalledWith("matches")
  })

  it("mescla avulsas (sou participante) e competitivas (minhas vagas) por created_at", async () => {
    const avulsa = {
      id: "a",
      created_at: "2026-06-07T10:00:00Z",
      status: "agendada",
    }
    const competitiva = {
      id: "c",
      created_at: "2026-06-07T09:00:00Z",
      status: "em_andamento",
    }
    const client = montarClient({
      avulsas: [avulsa],
      minhasVagas: [{ id: "v1" }, { id: "v2" }],
      competitivas: [competitiva],
    })

    const r = await getActiveMatches()

    // Mescladas e ORDENADAS por created_at (competitiva 09h vem antes da 10h).
    expect(r.map((p) => p.id)).toEqual(["c", "a"])
    expect(client.from).toHaveBeenCalledWith("tournament_slots")
    expect(client.from).toHaveBeenCalledWith("matches")
    // Avulsas: SÓ o modelo pessoa (vaga_1 null) e SÓ onde sou lado.
    expect(client.isSpy).toHaveBeenCalledWith("vaga_1", null)
    expect(client.orSpy).toHaveBeenCalledWith(
      `participante_1.eq.${EU},participante_2.eq.${EU}`
    )
    // Competitivas: partidas das MINHAS vagas (por id).
    expect(client.vagasEqSpy).toHaveBeenCalledWith("user_id", EU)
    expect(client.orSpy).toHaveBeenCalledWith(
      "vaga_1.in.(v1,v2),vaga_2.in.(v1,v2)"
    )
    // Falha-segura em ambas: só 'encerrada'/'encerrado' ocultam.
    expect(client.neqSpy).toHaveBeenCalledWith("status", "encerrada")
    expect(client.neqSpy).toHaveBeenCalledWith("tournament.status", "encerrado")
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", {
      ascending: true,
    })
  })

  it("embeda vagas com clube e técnico (shape do card competitivo)", async () => {
    const client = montarClient({ avulsas: [], minhasVagas: [{ id: "v1" }] })
    await getActiveMatches()
    // Whitespace normalizado (postgrest-js remove espaços não-citados).
    const cols = String(client.selectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    expect(cols).toContain(
      "vaga_1:tournament_slots!matches_vaga_1_fkey(id,rotulo,clube:teams(nome,escudo_url),tecnico:users(id,nome,avatar,celular))"
    )
    expect(cols).toContain(
      "vaga_2:tournament_slots!matches_vaga_2_fkey(id,rotulo,clube:teams(nome,escudo_url),tecnico:users(id,nome,avatar,celular))"
    )
    // O torneio segue com !inner (filtro de encerrado afeta a linha de matches).
    expect(cols).toContain(
      "tournament:tournaments!matches_tournament_id_fkey!inner(id,titulo,status)"
    )
  })

  it("sem vagas, NÃO faz a viagem de competitivas e devolve só avulsas", async () => {
    const avulsa = { id: "a", created_at: "2026-06-07T10:00:00Z" }
    const client = montarClient({ avulsas: [avulsa], minhasVagas: [] })
    const r = await getActiveMatches()
    expect(r.map((p) => p.id)).toEqual(["a"])
    // Só UMA chamada a select de matches (a competitiva foi pulada).
    expect(client.selectSpy).toHaveBeenCalledTimes(1)
  })

  it("retorna [] quando ambas as queries vêm null", async () => {
    montarClient({ avulsas: null, minhasVagas: [{ id: "v1" }], competitivas: null })
    const r = await getActiveMatches()
    expect(r).toEqual([])
  })

  it("lança erro amigável quando a query de avulsas falha", async () => {
    montarClient({ avulsasError: { message: "conexão recusada" } })
    await expect(getActiveMatches()).rejects.toThrow(
      /Falha ao carregar partidas ativas/
    )
  })

  it("lança erro amigável quando o subselect de vagas falha", async () => {
    montarClient({ vagasError: { message: "boom" } })
    await expect(getActiveMatches()).rejects.toThrow(
      /Falha ao carregar partidas ativas/
    )
  })

  it("lança erro amigável quando a query de competitivas falha", async () => {
    montarClient({
      avulsas: [],
      minhasVagas: [{ id: "v1" }],
      competitivasError: { message: "down" },
    })
    await expect(getActiveMatches()).rejects.toThrow(
      /Falha ao carregar partidas ativas/
    )
  })
})
