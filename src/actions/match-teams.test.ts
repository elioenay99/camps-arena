import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { revalidatePath } from "next/cache"

import { updateMatchTeams } from "@/actions/match"
import { createClient } from "@/lib/supabase/server"

const mockRevalidate = vi.mocked(revalidatePath)
const mockCreateClient = vi.mocked(createClient)

const UUID = "11111111-1111-4111-8111-111111111111"
const USER_ID = "22222222-2222-4222-8222-222222222222"
const OUTRO_ID = "33333333-3333-4333-8333-333333333333"
const TEAM_1 = "44444444-4444-4444-8444-444444444444"
const TEAM_2 = "55555555-5555-4555-8555-555555555555"

interface Cenario {
  user?: { id: string } | null
  readData?: {
    id: string
    participante_1: string | null
    participante_2: string | null
    time_1?: string | null
    time_2?: string | null
    status?: string
    tournament_id?: string
  } | null
  readError?: { message: string } | null
  writeData?: { id: string }[] | null
  writeError?: { message: string } | null
}

function montarClient(c: Cenario) {
  const updateSpy = vi.fn()
  const writeEqSpy = vi.fn()
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: c.user ?? null }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi
            .fn()
            .mockResolvedValue({ data: c.readData ?? null, error: c.readError ?? null }),
        })),
      })),
      update: vi.fn((vals: unknown) => {
        updateSpy(vals)
        return {
          eq: vi.fn((coluna: string, valor: unknown) => {
            writeEqSpy(coluna, valor)
            return {
              select: vi
                .fn()
                .mockResolvedValue({ data: c.writeData ?? null, error: c.writeError ?? null }),
            }
          }),
        }
      }),
    })),
    updateSpy,
    writeEqSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("updateMatchTeams", () => {
  it("rejeita entrada sem nenhum lado, sem tocar no banco", async () => {
    const r = await updateMatchTeams({ matchId: UUID })
    expect(r.ok).toBe(false)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("rejeita usuário não autenticado", async () => {
    const client = montarClient({ user: null })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1 })
    expect(r.ok).toBe(false)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })

  it("rejeita quem não participa e não escreve", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: OUTRO_ID, participante_2: null },
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1 })
    expect(r.ok).toBe(false)
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("associa o clube do lado 1 (só esse campo no patch) e revalida as duas rotas", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: USER_ID,
        participante_2: OUTRO_ID,
        tournament_id: "torneio-1",
      },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1 })
    expect(r.ok).toBe(true)
    expect(client.writeEqSpy).toHaveBeenCalledWith("id", UUID)
    expect(client.updateSpy).toHaveBeenCalledWith({ time_1: TEAM_1 })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    // Clube alimenta a classificação de clubes da página do torneio.
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios/torneio-1")
  })

  it("partida ENCERRADA rejeita troca de clube (alimenta a tabela de clubes)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: USER_ID,
        participante_2: OUTRO_ID,
        status: "encerrada",
      },
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/encerrada/i)
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("associa os dois lados quando ambos vêm no input", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1, time_2: TEAM_2 })
    expect(r.ok).toBe(true)
    expect(client.updateSpy).toHaveBeenCalledWith({ time_1: TEAM_1, time_2: TEAM_2 })
  })

  it("aceita time nulo (limpar o clube de um lado)", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
      writeData: [{ id: UUID }],
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: null })
    expect(r.ok).toBe(true)
    expect(client.updateSpy).toHaveBeenCalledWith({ time_1: null })
  })

  it("rejeita o mesmo clube nos dois lados (ambos no input), sem escrever", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: { id: UUID, participante_1: USER_ID, participante_2: OUTRO_ID },
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1, time_2: TEAM_1 })
    expect(r.ok).toBe(false)
    expect(client.updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("rejeita patch parcial que colide com o clube já gravado no outro lado", async () => {
    const client = montarClient({
      user: { id: USER_ID },
      readData: {
        id: UUID,
        participante_1: USER_ID,
        participante_2: OUTRO_ID,
        time_2: TEAM_1,
      },
    })
    const r = await updateMatchTeams({ matchId: UUID, time_1: TEAM_1 })
    expect(r.ok).toBe(false)
    expect(client.updateSpy).not.toHaveBeenCalled()
  })
})
