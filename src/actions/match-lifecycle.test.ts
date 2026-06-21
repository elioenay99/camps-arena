import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// O fechamento automático de rodada é SECUNDÁRIO ao encerramento — tem
// cobertura própria em closeRound.test.ts; aqui é no-op para focar no
// lifecycle (encerrar/reabrir).
vi.mock("@/features/match/closeRound", () => ({
  varrerOrfaosDaRodada: vi.fn(async () => ({ marcadas: 0 })),
}))

import { revalidatePath } from "next/cache"

import { encerrarPartida, reabrirPartida } from "@/actions/match"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const PARTIDA = "11111111-1111-4111-8111-111111111111"
const TORNEIO = "22222222-2222-4222-8222-222222222222"
const DONO = "33333333-3333-4333-8333-333333333333"

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Partida lida (status atual + torneio). */
  match?: { id: string; status: string; tournament_id: string } | null
  matchError?: boolean
  /** Lookup de propriedade do torneio. */
  torneio?: { id: string } | null
  torneioError?: boolean
  updateData?: { id: string }[] | null
  updateError?: boolean
}

/**
 * Cliente falso bifurcado por tabela. Spies de filtro provam que a
 * propriedade do TORNEIO é conferida por filtro (created_by) no servidor, e o
 * updateSpy captura o payload do UPDATE (só status).
 */
function montarClient(c: Cenario) {
  const filtroTorneioSpy = vi.fn()
  const updateSpy = vi.fn()
  const updateFiltroSpy = vi.fn()
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) =>
      tabela === "tournaments"
        ? {
            select: vi.fn(() => {
              const cadeia = {
                eq: vi.fn((col: string, val: unknown) => {
                  filtroTorneioSpy("eq", col, val)
                  return cadeia
                }),
                neq: vi.fn((col: string, val: unknown) => {
                  filtroTorneioSpy("neq", col, val)
                  return cadeia
                }),
                maybeSingle: vi.fn(async () => ({
                  data: c.torneio ?? null,
                  error: c.torneioError ? { message: "down" } : null,
                })),
              }
              return cadeia
            }),
          }
        : {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: c.match ?? null,
                  error: c.matchError ? { message: "down" } : null,
                })),
              })),
            })),
            update: vi.fn((vals: unknown) => {
              updateSpy(vals)
              // Cadeia encadeável: a guarda otimista de status usa
              // .eq().neq()/.eq() antes do .select() (fecha a corrida).
              const cadeia: Record<string, unknown> = {}
              cadeia.eq = vi.fn((col: string, val: unknown) => {
                updateFiltroSpy("eq", col, val)
                return cadeia
              })
              cadeia.neq = vi.fn((col: string, val: unknown) => {
                updateFiltroSpy("neq", col, val)
                return cadeia
              })
              cadeia.select = vi.fn(async () => ({
                data: c.updateData ?? null,
                error: c.updateError ? { message: "rls" } : null,
              }))
              return cadeia
            }),
          }
    ),
    filtroTorneioSpy,
    updateSpy,
    updateFiltroSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

const cenarioFeliz = (status: string): Cenario => ({
  user: { id: DONO },
  match: { id: PARTIDA, status, tournament_id: TORNEIO },
  torneio: { id: TORNEIO },
  updateData: [{ id: PARTIDA }],
})

beforeEach(() => vi.clearAllMocks())

describe("encerrarPartida", () => {
  it("id inválido rejeita sem tocar o banco", async () => {
    const r = await encerrarPartida("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Partida inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const { updateSpy } = montarClient({ user: null })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("partida inexistente/invisível e torneio alheio têm a MESMA resposta", async () => {
    const semPartida = montarClient({ user: { id: DONO }, match: null })
    const r1 = await encerrarPartida(PARTIDA)

    vi.clearAllMocks()
    const naoDono = montarClient({
      user: { id: DONO },
      match: { id: PARTIDA, status: "em_andamento", tournament_id: TORNEIO },
      torneio: null, // filtro created_by não achou
    })
    const r2 = await encerrarPartida(PARTIDA)

    expect(r1).toEqual(r2) // sem oráculo de existência
    expect(semPartida.updateSpy).not.toHaveBeenCalled()
    expect(naoDono.updateSpy).not.toHaveBeenCalled()
    // Lifecycle do torneio por FILTRO; a posse vem da capacidade (via RPC).
    expect(naoDono.filtroTorneioSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
  })

  it("torneio encerrado congela o lifecycle (mesma resposta, sem UPDATE)", async () => {
    // O filtro .neq('status','encerrado') derruba o lookup → torneio null.
    const { updateSpy } = montarClient({
      user: { id: DONO },
      match: { id: PARTIDA, status: "em_andamento", tournament_id: TORNEIO },
      torneio: null,
    })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/encerrado|dono/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("já encerrada rejeita a transição sem UPDATE", async () => {
    const { updateSpy } = montarClient(cenarioFeliz("encerrada"))
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: false, error: "Esta partida já está encerrada." })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("dono encerra em_andamento e revalida dashboard + página do torneio", async () => {
    const { updateSpy } = montarClient(cenarioFeliz("em_andamento"))
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("agendada também pode ser encerrada (W.O./desistência)", async () => {
    const { updateSpy } = montarClient(cenarioFeliz("agendada"))
    const r = await encerrarPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "encerrada" })
  })

  it("0 linhas no UPDATE (corrida/RLS) vira mensagem de recarregar", async () => {
    montarClient({ ...cenarioFeliz("em_andamento"), updateData: [] })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/recarregue/i)
  })

  it("erro do banco no UPDATE vira mensagem genérica", async () => {
    montarClient({ ...cenarioFeliz("em_andamento"), updateData: null, updateError: true })
    const r = await encerrarPartida(PARTIDA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível encerrar/i)
  })
})

describe("reabrirPartida", () => {
  it("só encerrada pode ser reaberta", async () => {
    const { updateSpy } = montarClient(cenarioFeliz("em_andamento"))
    const r = await reabrirPartida(PARTIDA)
    expect(r).toEqual({
      ok: false,
      error: "Só é possível reabrir uma partida encerrada.",
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("dono reabre encerrada para em_andamento", async () => {
    const { updateSpy } = montarClient(cenarioFeliz("encerrada"))
    const r = await reabrirPartida(PARTIDA)
    expect(r).toEqual({ ok: true })
    expect(updateSpy).toHaveBeenCalledWith({ status: "em_andamento", wo: false, wo_vencedor: null })
  })

  it("reabrir aplica a GUARDA otimista .eq(status, encerrada) no UPDATE", async () => {
    const { updateFiltroSpy } = montarClient(cenarioFeliz("encerrada"))
    await reabrirPartida(PARTIDA)
    // Fecha a corrida: só reabre se AINDA está encerrada.
    expect(updateFiltroSpy).toHaveBeenCalledWith("eq", "status", "encerrada")
  })

  it("encerrar aplica a GUARDA otimista .neq(status, encerrada) no UPDATE", async () => {
    const { updateFiltroSpy } = montarClient(cenarioFeliz("em_andamento"))
    await encerrarPartida(PARTIDA)
    // Fecha a corrida: não re-encerra uma já encerrada.
    expect(updateFiltroSpy).toHaveBeenCalledWith("neq", "status", "encerrada")
  })

  it("torneio alheio rejeita sem UPDATE", async () => {
    const { updateSpy } = montarClient({
      user: { id: "intruso" },
      match: { id: PARTIDA, status: "encerrada", tournament_id: TORNEIO },
      torneio: null,
    })
    const r = await reabrirPartida(PARTIDA)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
