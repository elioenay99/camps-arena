import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import { revalidatePath } from "next/cache"

import { createMatch } from "@/actions/match"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"
const P1 = "33333333-3333-4333-8333-333333333333"
const P2 = "44444444-4444-4444-8444-444444444444"

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Resultado do lookup de torneio (dono + não encerrado). */
  torneio?: { id: string } | null
  torneioError?: boolean
  insertError?: boolean
  insertThrows?: boolean
}

/**
 * Cliente falso com as duas formas que a action usa:
 *  - tournaments: select().eq().eq().neq().maybeSingle() — spies nos filtros
 *    provam que a propriedade é conferida por FILTRO no servidor.
 *  - matches: insert() — spy no payload prova que só os campos permitidos vão.
 */
function montarClient(c: Cenario) {
  const filtroSpy = vi.fn()
  const insertSpy = vi.fn(async () => {
    if (c.insertThrows) throw new Error("conexão caiu")
    return { error: c.insertError ? { message: "rls", code: "42501" } : null }
  })
  const maybeSingle = vi.fn(async () => ({
    data: c.torneio ?? null,
    error: c.torneioError ? { message: "down" } : null,
  }))
  const cadeia = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroSpy("eq", col, val)
      return cadeia
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filtroSpy("neq", col, val)
      return cadeia
    }),
    maybeSingle,
  }
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) =>
      tabela === "tournaments"
        ? { select: vi.fn(() => cadeia) }
        : { insert: insertSpy }
    ),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return { insertSpy, filtroSpy, fromSpy: client.from }
}

beforeEach(() => vi.clearAllMocks())

describe("createMatch", () => {
  it("entrada inválida não toca o banco", async () => {
    const r = await createMatch({}, formData({ tournamentId: "nao-uuid" }))
    expect(r.fieldErrors?.tournamentId).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("mesmo participante nos dois lados é rejeitado antes do banco", async () => {
    const r = await createMatch(
      {},
      formData({ tournamentId: TORNEIO, participante1: P1, participante2: P1 })
    )
    expect(r.fieldErrors?.participante2).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita e não insere", async () => {
    const { insertSpy } = montarClient({ user: null })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r.error).toMatch(/sess/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("erro de auth (getUser) rejeita mesmo com user presente, sem inserir", async () => {
    const { insertSpy } = montarClient({ user: { id: DONO }, authError: true })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r.error).toMatch(/sess/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("torneio de outro/encerrado/inexistente: mensagem única, sem inserir", async () => {
    const { insertSpy, filtroSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r.error).toMatch(/não encontrado|dono/i)
    expect(insertSpy).not.toHaveBeenCalled()
    // Propriedade e lifecycle conferidos por FILTRO no servidor.
    expect(filtroSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
  })

  it("erro no lookup do torneio vira mensagem genérica, sem inserir", async () => {
    const { insertSpy } = montarClient({ user: { id: DONO }, torneioError: true })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("insere só os campos permitidos e redireciona; '' vira null", async () => {
    const { insertSpy, fromSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
    })
    await expect(
      createMatch(
        {},
        formData({
          tournamentId: TORNEIO,
          participante1: P1,
          participante2: "",
          // Campos forjados são ignorados (insert é allowlist explícita).
          placar_1: "99",
          status: "encerrada",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")

    expect(insertSpy).toHaveBeenCalledWith({
      tournament_id: TORNEIO,
      participante_1: P1,
      participante_2: null,
    })
    // As DUAS tabelas certas, na ordem lookup → insert.
    expect(fromSpy).toHaveBeenCalledWith("tournaments")
    expect(fromSpy).toHaveBeenCalledWith("matches")
    // Dashboard é revalidado antes do redirect.
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
  })

  it("partida sem participantes é aceita (lados a definir)", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
    })
    await expect(
      createMatch({}, formData({ tournamentId: TORNEIO }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(insertSpy).toHaveBeenCalledWith({
      tournament_id: TORNEIO,
      participante_1: null,
      participante_2: null,
    })
  })

  it("participantes distintos preenchidos passam", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
    })
    await expect(
      createMatch(
        {},
        formData({ tournamentId: TORNEIO, participante1: P1, participante2: P2 })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(insertSpy).toHaveBeenCalledWith({
      tournament_id: TORNEIO,
      participante_1: P1,
      participante_2: P2,
    })
  })

  it("erro do banco (RLS) vira mensagem genérica, sem redirect", async () => {
    montarClient({ user: { id: DONO }, torneio: { id: TORNEIO }, insertError: true })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r).toEqual({
      error: "Não foi possível criar a partida agora. Tente novamente.",
    })
  })

  it("exceção no insert é tratada (não vira 500), sem redirect", async () => {
    montarClient({ user: { id: DONO }, torneio: { id: TORNEIO }, insertThrows: true })
    const r = await createMatch({}, formData({ tournamentId: TORNEIO }))
    expect(r).toEqual({
      error: "Não foi possível criar a partida agora. Tente novamente.",
    })
  })
})
