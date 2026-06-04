import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import { createTournament } from "@/actions/tournaments"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  insertError?: boolean
  insertThrows?: boolean
}

function montarClient(c: Cenario) {
  const insertSpy = vi.fn(async () => {
    if (c.insertThrows) throw new Error("conexão caiu")
    return { error: c.insertError ? { message: "rls", code: "42501" } : null }
  })
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn(() => ({ insert: insertSpy })),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return { insertSpy, fromSpy: client.from }
}

beforeEach(() => vi.clearAllMocks())

describe("createTournament", () => {
  it("título inválido não toca o banco", async () => {
    const r = await createTournament({}, formData({ titulo: "a" }))
    expect(r.fieldErrors?.titulo).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita e não insere", async () => {
    const { insertSpy } = montarClient({ user: null })
    const r = await createTournament({}, formData({ titulo: "Copa" }))
    expect(r.error).toMatch(/sess/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("erro de auth (getUser) rejeita mesmo com user presente, sem inserir", async () => {
    const { insertSpy } = montarClient({ user: { id: "u1" }, authError: true })
    const r = await createTournament({}, formData({ titulo: "Copa" }))
    expect(r.error).toMatch(/sess/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("insere com created_by = id da sessão (não confia no cliente) e is_public do checkbox", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    // checkbox marcado → isPublic presente; e um created_by forjado no form é ignorado.
    await expect(
      createTournament(
        {},
        formData({ titulo: "Copa", isPublic: "on", created_by: "atacante" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")

    expect(insertSpy).toHaveBeenCalledWith({
      titulo: "Copa",
      is_public: true,
      created_by: "dono-1",
      pontos_vitoria: 3,
      pontos_empate: 1,
      pontos_derrota: 0,
    })
  })

  it("checkbox ausente grava torneio privado", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament({}, formData({ titulo: "Privado" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(insertSpy).toHaveBeenCalledWith({
      titulo: "Privado",
      is_public: false,
      created_by: "dono-1",
      pontos_vitoria: 3,
      pontos_empate: 1,
      pontos_derrota: 0,
    })
  })

  it("pontuação customizada do form é convertida e gravada", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({
          titulo: "Copa",
          isPublic: "on",
          pontosVitoria: "2",
          pontosEmpate: "1",
          pontosDerrota: "0",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pontos_vitoria: 2,
        pontos_empate: 1,
        pontos_derrota: 0,
      })
    )
  })

  it("campos de pontuação vazios assumem os defaults 3/1/0", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({
          titulo: "Copa",
          isPublic: "on",
          pontosVitoria: "",
          pontosEmpate: "",
          pontosDerrota: "",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pontos_vitoria: 3,
        pontos_empate: 1,
        pontos_derrota: 0,
      })
    )
  })

  it("pontuação incoerente (derrota > vitória) não toca o banco", async () => {
    const r = await createTournament(
      {},
      formData({ titulo: "Copa", pontosVitoria: "1", pontosDerrota: "5" })
    )
    // 5 > empate default (1) → o refine de derrota<=empate acusa o campo.
    expect(r.fieldErrors?.pontosDerrota).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("pontuação não-numérica ('abc' → NaN) não toca o banco", async () => {
    const r = await createTournament(
      {},
      formData({ titulo: "Copa", pontosVitoria: "abc" })
    )
    expect(r.fieldErrors?.pontosVitoria).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("erro do banco (RLS) vira mensagem genérica, sem redirect", async () => {
    montarClient({ user: { id: "dono-1" }, insertError: true })
    const r = await createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    expect(r).toEqual({
      error: "Não foi possível criar o torneio agora. Tente novamente.",
    })
  })

  it("exceção no insert é tratada (não vira 500), sem redirect", async () => {
    montarClient({ user: { id: "dono-1" }, insertThrows: true })
    const r = await createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    expect(r).toEqual({
      error: "Não foi possível criar o torneio agora. Tente novamente.",
    })
  })
})
