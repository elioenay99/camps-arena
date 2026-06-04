import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getActiveMatches } from "@/features/match/data/getActiveMatches"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

interface Cenario {
  data?: unknown[] | null
  error?: { message: string } | null
}

/** Cliente falso: from(...).select(...).neq(...).neq(...).order(...) → {data,error}. */
function montarClient(c: Cenario) {
  const selectSpy = vi.fn()
  const neqSpy = vi.fn()
  const orderSpy = vi.fn()
  // `neq` retorna o próprio builder: aceita quantos filtros a query encadear.
  const builder = {
    neq: vi.fn((coluna: string, valor: unknown) => {
      neqSpy(coluna, valor)
      return builder
    }),
    order: vi.fn((coluna: string, opts: unknown) => {
      orderSpy(coluna, opts)
      return Promise.resolve({ data: c.data ?? null, error: c.error ?? null })
    }),
  }
  const client = {
    from: vi.fn(() => ({
      select: vi.fn((cols: unknown) => {
        selectSpy(cols)
        return builder
      }),
    })),
    selectSpy,
    neqSpy,
    orderSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getActiveMatches", () => {
  it("retorna as partidas filtrando não-encerradas e ordenando por created_at", async () => {
    const linhas = [
      { id: "a", placar_1: 0, placar_2: 0, status: "agendada" },
      { id: "b", placar_1: 1, placar_2: 2, status: "em_andamento" },
    ]
    const client = montarClient({ data: linhas })

    const r = await getActiveMatches()

    expect(r).toEqual(linhas)
    expect(client.from).toHaveBeenCalledWith("matches")
    // Decisão falha-segura: exclui só 'encerrada' (não whitelist por .eq).
    expect(client.neqSpy).toHaveBeenCalledWith("status", "encerrada")
    // Ordem estável (não reordena a cada save, ao contrário de updated_at).
    expect(client.orderSpy).toHaveBeenCalledWith("created_at", { ascending: true })
  })

  it("filtra torneio encerrado no servidor: embed !inner + neq no ALIAS", async () => {
    const client = montarClient({ data: [] })

    await getActiveMatches()

    // !inner é seguro (tournament_id NOT NULL) e exigido para o filtro de embed
    // afetar as linhas de matches (sem ele o PostgREST só anula o embed).
    // Whitespace normalizado: o postgrest-js remove espaços não-citados antes
    // de enviar — assertar a forma normalizada evita acoplar à formatação.
    const cols = String(client.selectSpy.mock.calls[0][0]).replace(/\s+/g, "")
    // `id` alimenta o link do card para a página de classificação.
    expect(cols).toContain(
      "tournament:tournaments!matches_tournament_id_fkey!inner(id,titulo,status)"
    )
    // Falha-segura simétrica ao .neq de matches: só 'encerrado' oculta
    // (rascunho/futuros aparecem). O caminho usa o ALIAS `tournament`,
    // exigência do PostgREST para embeds aliased.
    expect(client.neqSpy).toHaveBeenCalledWith("tournament.status", "encerrado")
  })

  it("retorna [] quando data é null", async () => {
    montarClient({ data: null })
    const r = await getActiveMatches()
    expect(r).toEqual([])
  })

  it("lança erro amigável quando a query falha", async () => {
    montarClient({ error: { message: "conexão recusada" } })
    await expect(getActiveMatches()).rejects.toThrow(/Falha ao carregar partidas ativas/)
  })
})
