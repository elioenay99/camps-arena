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

const TORNEIO = "11111111-1111-4111-8111-111111111111"

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
  participanteError?: boolean
  /** Códigos de erro devolvidos pelos inserts SUCESSIVOS do invite. */
  inviteErrosPorTentativa?: (string | null)[]
}

/**
 * Cliente falso para as três escritas da action:
 *  - tournaments: insert().select().single() — devolve o id criado.
 *  - participants: insert() — entrada automática do dono.
 *  - tournament_invites: insert() — geração do código (com retry de colisão).
 */
function montarClient(c: Cenario) {
  const insertSpy = vi.fn((payload: unknown) => {
    if (c.insertThrows) throw new Error("conexão caiu")
    void payload
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: c.insertError ? null : { id: TORNEIO },
          error: c.insertError ? { message: "rls", code: "42501" } : null,
        })),
      })),
    }
  })
  const participanteInsertSpy = vi.fn(async (_payload: unknown) => {
    void _payload
    return {
      error: c.participanteError ? { message: "down", code: "XX000" } : null,
    }
  })
  let tentativaInvite = 0
  const inviteInsertSpy = vi.fn(async (_payload: unknown) => {
    void _payload
    const codigo = c.inviteErrosPorTentativa?.[tentativaInvite] ?? null
    tentativaInvite++
    return { error: codigo ? { message: "erro", code: codigo } : null }
  })
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments") return { insert: insertSpy }
      if (tabela === "participants") return { insert: participanteInsertSpy }
      return { insert: inviteInsertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return { insertSpy, participanteInsertSpy, inviteInsertSpy, fromSpy: client.from }
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
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)

    expect(insertSpy).toHaveBeenCalledWith({
      titulo: "Copa",
      is_public: true,
      created_by: "dono-1",
      formato: "avulso",
      ida_e_volta: false,
      terceiro_lugar: false,
      pontos_vitoria: 3,
      pontos_empate: 1,
      pontos_derrota: 0,
    })
    // Sem status explícito: avulso fica com o default 'ativo' do banco.
    expect(insertSpy.mock.calls[0][0]).not.toHaveProperty("status")
  })

  it("formato liga nasce em rascunho com ida_e_volta do checkbox", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({ titulo: "Liga", isPublic: "on", formato: "liga", idaEVolta: "on" })
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        formato: "liga",
        ida_e_volta: true,
        status: "rascunho",
      })
    )
  })

  it("liga sem ida-e-volta grava ida_e_volta false (e ainda nasce rascunho)", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament({}, formData({ titulo: "Liga", isPublic: "on", formato: "liga" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        formato: "liga",
        ida_e_volta: false,
        status: "rascunho",
      })
    )
  })

  it("ida-e-volta marcado em torneio AVULSO é ignorado (vai false)", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({ titulo: "Copa", isPublic: "on", formato: "avulso", idaEVolta: "on" })
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ formato: "avulso", ida_e_volta: false })
    )
    expect(insertSpy.mock.calls[0][0]).not.toHaveProperty("status")
  })

  it("formato mata_mata nasce rascunho com ida_e_volta e terceiro_lugar dos checkboxes", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({
          titulo: "Copa",
          isPublic: "on",
          formato: "mata_mata",
          idaEVolta: "on",
          terceiroLugar: "on",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        formato: "mata_mata",
        ida_e_volta: true,
        terceiro_lugar: true,
        status: "rascunho",
      })
    )
  })

  it("terceiroLugar marcado em LIGA é normalizado para false (opção exclusiva do mata-mata)", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({
          titulo: "Liga",
          isPublic: "on",
          formato: "liga",
          terceiroLugar: "on",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ formato: "liga", terceiro_lugar: false })
    )
  })

  it("idaEVolta marcado em mata_mata grava ida_e_volta true (vale no formato gerado)", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formData({
          titulo: "Copa",
          isPublic: "on",
          formato: "mata_mata",
          idaEVolta: "on",
        })
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ formato: "mata_mata", ida_e_volta: true })
    )
  })

  it("formato inválido não toca o banco", async () => {
    const r = await createTournament(
      {},
      formData({ titulo: "Copa", formato: "mata-mata" })
    )
    expect(r.fieldErrors?.formato).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("dono entra como participante e o convite é gerado (código de 16 chars)", async () => {
    const { participanteInsertSpy, inviteInsertSpy } = montarClient({
      user: { id: "dono-1" },
    })
    await expect(
      createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)

    expect(participanteInsertSpy).toHaveBeenCalledWith({
      tournament_id: TORNEIO,
      user_id: "dono-1",
    })
    expect(inviteInsertSpy).toHaveBeenCalledTimes(1)
    const payload = inviteInsertSpy.mock.calls[0][0] as {
      tournament_id: string
      code: string
    }
    expect(payload.tournament_id).toBe(TORNEIO)
    expect(payload.code).toMatch(/^[0-9a-z]{16}$/)
  })

  it("falha nas escritas complementares NÃO derruba a criação (recuperável na UI)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({
      user: { id: "dono-1" },
      participanteError: true,
      inviteErrosPorTentativa: ["XX000"],
    })
    // O torneio foi criado → redirect normal, apesar dos erros complementares.
    await expect(
      createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("colisão de código (23505) ganha UM retry com código novo", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { inviteInsertSpy } = montarClient({
      user: { id: "dono-1" },
      inviteErrosPorTentativa: ["23505", null],
    })
    await expect(
      createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(inviteInsertSpy).toHaveBeenCalledTimes(2)
    const c1 = (inviteInsertSpy.mock.calls[0][0] as { code: string }).code
    const c2 = (inviteInsertSpy.mock.calls[1][0] as { code: string }).code
    expect(c1).not.toBe(c2)
    consoleSpy.mockRestore()
  })

  it("erro de invite que NÃO é colisão não ganha retry", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { inviteInsertSpy } = montarClient({
      user: { id: "dono-1" },
      inviteErrosPorTentativa: ["42501"],
    })
    await expect(
      createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(inviteInsertSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it("checkbox ausente grava torneio privado", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament({}, formData({ titulo: "Privado" }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        titulo: "Privado",
        is_public: false,
        created_by: "dono-1",
      })
    )
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
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
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
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
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
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { participanteInsertSpy } = montarClient({
      user: { id: "dono-1" },
      insertError: true,
    })
    const r = await createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    expect(r).toEqual({
      error: "Não foi possível criar o torneio agora. Tente novamente.",
    })
    // Sem torneio criado, nenhuma escrita complementar acontece.
    expect(participanteInsertSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("exceção no insert é tratada (não vira 500), sem redirect", async () => {
    montarClient({ user: { id: "dono-1" }, insertThrows: true })
    const r = await createTournament({}, formData({ titulo: "Copa", isPublic: "on" }))
    expect(r).toEqual({
      error: "Não foi possível criar o torneio agora. Tente novamente.",
    })
  })
})
