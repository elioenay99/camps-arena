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
/** Ids de clube (uuid do cache teams) para a criação competitiva. */
const CLUBE_A = "aaaaaaaa-0000-4000-8000-000000000000"
const CLUBE_B = "bbbbbbbb-0000-4000-8000-000000000000"
/** Ids das vagas devolvidas pelo INSERT em lote de tournament_slots. */
const VAGA_1 = "11111111-aaaa-4aaa-8aaa-111111111111"
const VAGA_2 = "22222222-aaaa-4aaa-8aaa-222222222222"

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

/** FormData com clubes (inputs hidden name="clubes", lidos por getAll). */
function formDataComClubes(campos: Record<string, string>, clubes: string[]) {
  const fd = formData(campos)
  for (const c of clubes) fd.append("clubes", c)
  return fd
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  insertError?: boolean
  insertThrows?: boolean
  participanteError?: boolean
  /** Códigos de erro devolvidos pelos inserts SUCESSIVOS do invite (avulso). */
  inviteErrosPorTentativa?: (string | null)[]
  /** Vagas geradas pelo INSERT de tournament_slots (competitivo). */
  vagasGeradas?: { id: string }[] | null
  vagasError?: boolean
  /** Códigos de erro dos inserts SUCESSIVOS de slot_invites (competitivo). */
  slotInvitesErrosPorTentativa?: (string | null)[]
  /** Falha do DELETE compensatório (vagas falharam → torneio é removido). */
  deleteError?: boolean
}

/**
 * Cliente falso para as escritas da action. Avulso:
 *  - tournaments: insert().select().single() — devolve o id criado.
 *  - participants: insert() — entrada automática do dono.
 *  - tournament_invites: insert() — geração do código (com retry de colisão).
 * Competitivo (formato gerado):
 *  - tournament_slots: insert().select('id') — vagas (uma por clube), devolve ids.
 *  - slot_invites: insert() — lote de codes (com retry de colisão).
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
  // tournament_slots: insert(...).select('id') — devolve as vagas criadas.
  const slotsInsertSpy = vi.fn((_payload: unknown) => {
    void _payload
    return {
      select: vi.fn(async () => ({
        data: c.vagasError
          ? null
          : (c.vagasGeradas ?? [{ id: VAGA_1 }, { id: VAGA_2 }]),
        error: c.vagasError ? { message: "rls", code: "42501" } : null,
      })),
    }
  })
  let tentativaSlotInvite = 0
  const slotInvitesInsertSpy = vi.fn(async (_payload: unknown) => {
    void _payload
    const codigo = c.slotInvitesErrosPorTentativa?.[tentativaSlotInvite] ?? null
    tentativaSlotInvite++
    return { error: codigo ? { message: "erro", code: codigo } : null }
  })
  // tournaments DELETE (compensação quando as vagas falham): cadeia
  // .delete().eq(id).eq(created_by) thenable.
  const deleteFiltroSpy = vi.fn()
  const cadeiaDelete = {
    eq: vi.fn((col: string, val: unknown) => {
      deleteFiltroSpy("eq", col, val)
      return cadeiaDelete
    }),
    then: (resolve: (v: { error: { message: string; code: string } | null }) => unknown) =>
      resolve({
        error: c.deleteError ? { message: "down", code: "XX000" } : null,
      }),
  }
  const deleteSpy = vi.fn(() => cadeiaDelete)

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments")
        return { insert: insertSpy, delete: deleteSpy }
      if (tabela === "participants") return { insert: participanteInsertSpy }
      if (tabela === "tournament_slots") return { insert: slotsInsertSpy }
      if (tabela === "slot_invites") return { insert: slotInvitesInsertSpy }
      return { insert: inviteInsertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    insertSpy,
    participanteInsertSpy,
    inviteInsertSpy,
    slotsInsertSpy,
    slotInvitesInsertSpy,
    deleteSpy,
    deleteFiltroSpy,
    fromSpy: client.from,
  }
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
      por_nome: false,
      pontos_vitoria: 3,
      pontos_empate: 1,
      pontos_derrota: 0,
      // Identidade (change add-cores-campeonato): sem cor no form ⇒ null.
      cor_primaria: null,
      cor_secundaria: null,
    })
    // Sem status explícito: avulso fica com o default 'ativo' do banco.
    expect(insertSpy.mock.calls[0][0]).not.toHaveProperty("status")
  })

  it("formato liga nasce em rascunho com ida_e_volta do checkbox", async () => {
    const { insertSpy } = montarClient({ user: { id: "dono-1" } })
    await expect(
      createTournament(
        {},
        formDataComClubes(
          { titulo: "Liga", isPublic: "on", formato: "liga", idaEVolta: "on" },
          [CLUBE_A, CLUBE_B]
        )
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
      createTournament(
        {},
        formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
          CLUBE_A,
          CLUBE_B,
        ])
      )
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
        formDataComClubes(
          {
            titulo: "Copa",
            isPublic: "on",
            formato: "mata_mata",
            idaEVolta: "on",
            terceiroLugar: "on",
          },
          [CLUBE_A, CLUBE_B]
        )
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
        formDataComClubes(
          {
            titulo: "Liga",
            isPublic: "on",
            formato: "liga",
            terceiroLugar: "on",
          },
          [CLUBE_A, CLUBE_B]
        )
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
        formDataComClubes(
          {
            titulo: "Copa",
            isPublic: "on",
            formato: "mata_mata",
            idaEVolta: "on",
          },
          [CLUBE_A, CLUBE_B]
        )
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

  it("AVULSO: dono entra como participante e o convite é gerado (código de 16 chars)", async () => {
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

  it("COMPETITIVO sem clubes suficientes (< 2) não toca o banco", async () => {
    const r = await createTournament(
      {},
      formDataComClubes({ titulo: "Liga", formato: "liga" }, [CLUBE_A])
    )
    expect(r.fieldErrors?.clubes).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("COMPETITIVO com clubes duplicados não toca o banco", async () => {
    const r = await createTournament(
      {},
      formDataComClubes({ titulo: "Liga", formato: "liga" }, [CLUBE_A, CLUBE_A])
    )
    expect(r.fieldErrors?.clubes).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("COMPETITIVO grava uma VAGA por clube (técnico vazio) e um code por vaga", async () => {
    const { slotsInsertSpy, slotInvitesInsertSpy, participanteInsertSpy, inviteInsertSpy } =
      montarClient({
        user: { id: "dono-1" },
        vagasGeradas: [{ id: VAGA_1 }, { id: VAGA_2 }],
      })
    await expect(
      createTournament(
        {},
        formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
          CLUBE_A,
          CLUBE_B,
        ])
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)

    // Vagas: uma por clube, sem user_id (técnico só pelo aceite do convite).
    expect(slotsInsertSpy).toHaveBeenCalledTimes(1)
    const vagasPayload = slotsInsertSpy.mock.calls[0][0] as {
      tournament_id: string
      team_id: string
    }[]
    expect(vagasPayload).toEqual([
      { tournament_id: TORNEIO, team_id: CLUBE_A },
      { tournament_id: TORNEIO, team_id: CLUBE_B },
    ])
    for (const v of vagasPayload) expect(v).not.toHaveProperty("user_id")

    // Um code por vaga (16 chars), em lote.
    expect(slotInvitesInsertSpy).toHaveBeenCalledTimes(1)
    const codesPayload = slotInvitesInsertSpy.mock.calls[0][0] as {
      slot_id: string
      code: string
    }[]
    expect(codesPayload.map((c) => c.slot_id).sort()).toEqual(
      [VAGA_1, VAGA_2].sort()
    )
    for (const c of codesPayload) expect(c.code).toMatch(/^[0-9a-z]{16}$/)

    // Competitivo NÃO usa participants nem convite genérico.
    expect(participanteInsertSpy).not.toHaveBeenCalled()
    expect(inviteInsertSpy).not.toHaveBeenCalled()
  })

  it("COMPETITIVO: colisão (23505) regenera TODOS os codes e re-tenta o lote 1x", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { slotInvitesInsertSpy } = montarClient({
      user: { id: "dono-1" },
      vagasGeradas: [{ id: VAGA_1 }, { id: VAGA_2 }],
      slotInvitesErrosPorTentativa: ["23505", null],
    })
    await expect(
      createTournament(
        {},
        formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
          CLUBE_A,
          CLUBE_B,
        ])
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(slotInvitesInsertSpy).toHaveBeenCalledTimes(2)
    const c1 = (slotInvitesInsertSpy.mock.calls[0][0] as { code: string }[])[0].code
    const c2 = (slotInvitesInsertSpy.mock.calls[1][0] as { code: string }[])[0].code
    expect(c1).not.toBe(c2)
    consoleSpy.mockRestore()
  })

  it("COMPETITIVO: erro não-colisão nos codes não ganha retry (recuperável na UI)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { slotInvitesInsertSpy } = montarClient({
      user: { id: "dono-1" },
      vagasGeradas: [{ id: VAGA_1 }, { id: VAGA_2 }],
      slotInvitesErrosPorTentativa: ["42501"],
    })
    await expect(
      createTournament(
        {},
        formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
          CLUBE_A,
          CLUBE_B,
        ])
      )
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(slotInvitesInsertSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it("COMPETITIVO: falha nas vagas COMPENSA — deleta o torneio e retorna erro, sem redirect", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { slotInvitesInsertSpy, deleteSpy, deleteFiltroSpy } = montarClient({
      user: { id: "dono-1" },
      vagasError: true,
    })
    // Competitivo sem vagas é beco sem saída (não há UI para repor clubes):
    // a action remove o torneio recém-criado e devolve o erro ao form (o
    // useActionState preserva os campos para o re-submit).
    const r = await createTournament(
      {},
      formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
        CLUBE_A,
        CLUBE_B,
      ])
    )
    expect(r.error).toMatch(/nada foi salvo/i)
    expect(slotInvitesInsertSpy).not.toHaveBeenCalled()
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    // Compensação filtrada por id + dono (nunca deleta torneio de terceiro).
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "created_by", "dono-1")
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("COMPETITIVO: vagas vazias sem erro (0 linhas) também compensam", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { deleteSpy } = montarClient({
      user: { id: "dono-1" },
      vagasGeradas: [],
    })
    const r = await createTournament(
      {},
      formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
        CLUBE_A,
        CLUBE_B,
      ])
    )
    expect(r.error).toMatch(/nada foi salvo/i)
    expect(deleteSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it("COMPETITIVO: DELETE compensatório falho não muda a resposta (erro, sem redirect)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({
      user: { id: "dono-1" },
      vagasError: true,
      deleteError: true,
    })
    // Best-effort: sobra um rascunho sem vagas (invisível ao jogo), mas o
    // usuário recebe o MESMO erro acionável.
    const r = await createTournament(
      {},
      formDataComClubes({ titulo: "Liga", isPublic: "on", formato: "liga" }, [
        CLUBE_A,
        CLUBE_B,
      ])
    )
    expect(r.error).toMatch(/nada foi salvo/i)
    consoleSpy.mockRestore()
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
