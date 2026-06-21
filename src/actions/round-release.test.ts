import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { liberarRodadas } from "@/actions/tournaments"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const TORNEIO = "22222222-2222-4222-8222-222222222222"
const DONO = "33333333-3333-4333-8333-333333333333"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  torneio?: { id: string } | null
  torneioError?: boolean
  updateData?: { id: string }[] | null
  updateError?: boolean
}

/** Registra os filtros aplicados ao UPDATE de matches (método, coluna, valor). */
type Filtro = [string, unknown, unknown]

function montarClient(cfg: Cenario) {
  const updateSpy = vi.fn()
  const filtros: Filtro[] = []

  const matchesFrom = {
    update: vi.fn((v: unknown) => {
      updateSpy(v)
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn((c: unknown, val: unknown) => {
        filtros.push(["eq", c, val])
        return cadeia
      })
      cadeia.is = vi.fn((c: unknown, val: unknown) => {
        filtros.push(["is", c, val])
        return cadeia
      })
      cadeia.lte = vi.fn((c: unknown, val: unknown) => {
        filtros.push(["lte", c, val])
        return cadeia
      })
      cadeia.not = vi.fn((c: unknown, op: unknown, val: unknown) => {
        filtros.push(["not", c, `${op}:${val}`])
        return cadeia
      })
      cadeia.select = vi.fn(async () => ({
        data: cfg.updateError ? null : (cfg.updateData ?? [{ id: "m1" }]),
        error: cfg.updateError ? { message: "rls" } : null,
      }))
      return cadeia
    }),
  }

  const tournamentsFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.neq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({
        data: cfg.torneio ?? null,
        error: cfg.torneioError ? { message: "down" } : null,
      }))
      return cadeia
    }),
  }

  const client = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: cfg.user ?? null },
        error: cfg.authError ? { message: "jwt" } : null,
      })),
    },
    from: vi.fn((t: string) => (t === "matches" ? matchesFrom : tournamentsFrom)),
    updateSpy,
    filtros,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => vi.clearAllMocks())

describe("liberarRodadas", () => {
  it("id ou alvo inválido rejeita sem tocar o banco", async () => {
    expect(await liberarRodadas("lixo", { tipo: "tudo" })).toEqual({
      ok: false,
      error: "Dados inválidos.",
    })
    expect(
      await liberarRodadas(TORNEIO, { tipo: "rodada", rodada: 0 } as never)
    ).toEqual({ ok: false, error: "Dados inválidos." })
    expect(
      await liberarRodadas(TORNEIO, { tipo: "xpto" } as never)
    ).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const c = montarClient({ user: null })
    const r = await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(r.ok).toBe(false)
    expect(c.updateSpy).not.toHaveBeenCalled()
  })

  it("não-dono / torneio encerrado recebe resposta de propriedade", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: null })
    const r = await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, encerrado ou você não é o dono dele.",
    })
    expect(c.updateSpy).not.toHaveBeenCalled()
  })

  it("falha ao buscar o torneio é genérica", async () => {
    montarClient({ user: { id: DONO }, torneioError: true })
    const r = await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível liberar agora. Tente novamente.",
    })
  })

  it("sempre seta liberada_em e filtra por torneio + ocultas (idempotência)", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    const r = await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(r).toEqual({ ok: true, liberadas: 1 })
    // o UPDATE seta liberada_em (timestamp ISO)
    const arg = c.updateSpy.mock.calls[0][0] as { liberada_em: string }
    expect(typeof arg.liberada_em).toBe("string")
    // filtros base: tournament_id + liberada_em is null (só ocultas)
    expect(c.filtros).toContainEqual(["eq", "tournament_id", TORNEIO])
    expect(c.filtros).toContainEqual(["is", "liberada_em", null])
  })

  it("alvo rodada → filtra .eq(rodada)", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    await liberarRodadas(TORNEIO, { tipo: "rodada", rodada: 3 })
    expect(c.filtros).toContainEqual(["eq", "rodada", 3])
    expect(c.filtros.some((f) => f[0] === "lte")).toBe(false)
  })

  it("alvo ate → filtra .lte(rodada)", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    await liberarRodadas(TORNEIO, { tipo: "ate", rodada: 5 })
    expect(c.filtros).toContainEqual(["lte", "rodada", 5])
  })

  it("alvo ate combina .lte com .is(liberada_em null) — furos ficam idempotentes", async () => {
    // Com rodadas já liberadas no meio (buraco), o .is(liberada_em null) garante
    // que só as OCULTAS <= N sejam tocadas — releitura não reverte as visíveis.
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    await liberarRodadas(TORNEIO, { tipo: "ate", rodada: 4 })
    expect(c.filtros).toContainEqual(["lte", "rodada", 4])
    expect(c.filtros).toContainEqual(["is", "liberada_em", null])
    expect(c.filtros).toContainEqual(["eq", "tournament_id", TORNEIO])
  })

  it("alvo faseGrupos → filtra .not(grupo is null)", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    await liberarRodadas(TORNEIO, { tipo: "faseGrupos" })
    expect(c.filtros).toContainEqual(["not", "grupo", "is:null"])
  })

  it("alvo tudo → sem filtro de rodada/grupo além do base", async () => {
    const c = montarClient({ user: { id: DONO }, torneio: { id: TORNEIO } })
    await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(c.filtros.some((f) => f[1] === "rodada" || f[1] === "grupo")).toBe(false)
  })

  it("erro no UPDATE é genérico", async () => {
    montarClient({ user: { id: DONO }, torneio: { id: TORNEIO }, updateError: true })
    const r = await liberarRodadas(TORNEIO, { tipo: "tudo" })
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível liberar agora. Tente novamente.",
    })
  })

  it("conta as partidas liberadas", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      updateData: [{ id: "a" }, { id: "b" }, { id: "c" }],
    })
    const r = await liberarRodadas(TORNEIO, { tipo: "rodada", rodada: 1 })
    expect(r).toEqual({ ok: true, liberadas: 3 })
  })
})
