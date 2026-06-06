import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from "next/cache"

import { iniciarTorneio } from "@/actions/tournaments"
import { LIGA_MAX_PARTICIPANTES } from "@/features/league/gerarTabelaLiga"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

/** Ids com ordem de code-point conhecida (a..d) para asserções da tabela. */
const A = "aaaaaaaa-0000-4000-8000-000000000000"
const B = "bbbbbbbb-0000-4000-8000-000000000000"
const C = "cccccccc-0000-4000-8000-000000000000"
const D = "dddddddd-0000-4000-8000-000000000000"

interface PartidaInserida {
  tournament_id: string
  participante_1: string
  participante_2: string
  rodada: number
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Lookup do torneio (dono + liga + rascunho). */
  torneio?: { id: string; ida_e_volta: boolean } | null
  torneioError?: boolean
  /** Partidas com rodada já existentes (detecção de tabela gerada). */
  jaGeradas?: boolean
  geradasError?: boolean
  /** user_ids confirmados devolvidos por participants. */
  confirmados?: string[]
  participantesError?: boolean
  insertError?: boolean
  /** Resultado do UPDATE de promoção. */
  updateData?: { id: string }[] | null
  updateError?: boolean
}

/**
 * Cliente falso com as cinco interações da action:
 *  - tournaments select: eq(id).eq(created_by).eq(formato).eq(status) —
 *    spies provam a propriedade/estado por FILTRO.
 *  - matches select: not('rodada','is',null).limit(1) — detecção de retry.
 *  - participants select: eq(tournament_id) — elenco confirmado.
 *  - matches insert: payload em lote (a tabela inteira).
 *  - tournaments update: promoção a 'ativo' com filtros + select de confirmação.
 */
function montarClient(c: Cenario) {
  const filtroTorneioSpy = vi.fn()
  const filtroUpdateSpy = vi.fn()
  const geradasSpy = vi.fn()
  const insertSpy = vi.fn(async (rows: PartidaInserida[]) => {
    void rows
    return { error: c.insertError ? { message: "rls", code: "42501" } : null }
  })

  const cadeiaTorneioSelect = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroTorneioSpy("eq", col, val)
      return cadeiaTorneioSelect
    }),
    maybeSingle: vi.fn(async () => ({
      data: c.torneio ?? null,
      error: c.torneioError ? { message: "down" } : null,
    })),
  }

  const cadeiaGeradas = {
    eq: vi.fn(() => cadeiaGeradas),
    not: vi.fn((col: string, op: string, val: unknown) => {
      geradasSpy(col, op, val)
      return cadeiaGeradas
    }),
    limit: vi.fn(async () => ({
      data: c.geradasError ? null : c.jaGeradas ? [{ id: "m1" }] : [],
      error: c.geradasError ? { message: "down" } : null,
    })),
  }

  const cadeiaParticipantes = {
    eq: vi.fn(async () => ({
      data: c.participantesError
        ? null
        : (c.confirmados ?? []).map((id) => ({ user_id: id })),
      error: c.participantesError ? { message: "down" } : null,
    })),
  }

  const cadeiaUpdate = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroUpdateSpy("eq", col, val)
      return cadeiaUpdate
    }),
    select: vi.fn(async () => ({
      data: c.updateError ? null : (c.updateData ?? [{ id: TORNEIO }]),
      error: c.updateError ? { message: "down" } : null,
    })),
  }
  const updateSpy = vi.fn(() => cadeiaUpdate)

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments")
        return { select: vi.fn(() => cadeiaTorneioSelect), update: updateSpy }
      if (tabela === "participants")
        return { select: vi.fn(() => cadeiaParticipantes) }
      return { select: vi.fn(() => cadeiaGeradas), insert: insertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    insertSpy,
    updateSpy,
    filtroTorneioSpy,
    filtroUpdateSpy,
    geradasSpy,
    fromSpy: client.from,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("iniciarTorneio", () => {
  it("id inválido rejeita sem tocar o banco", async () => {
    const r = await iniciarTorneio("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({ user: null })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("não-dono/avulso/já iniciado: resposta única via FILTRO, sem escrever", async () => {
    const { insertSpy, updateSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, já iniciado ou você não é o dono dele.",
    })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    // Propriedade + formato + estado conferidos por FILTRO no servidor.
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "formato", "liga")
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "status", "rascunho")
  })

  it("menos de 2 participantes rejeita com orientação, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      confirmados: [A],
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/pelo menos 2/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("acima do limite rejeita, sem escrever", async () => {
    const muitos = Array.from(
      { length: LIGA_MAX_PARTICIPANTES + 1 },
      (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`
    )
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      confirmados: muitos,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/no máximo/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("sucesso: gera a tabela completa (ida simples) e promove a ativo", async () => {
    const { insertSpy, updateSpy, filtroUpdateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      // Desordenados de propósito: a action ordena por code-point.
      confirmados: [C, A, D, B],
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const rows = insertSpy.mock.calls[0][0]
    // 4 participantes ida simples: C(4,2) = 6 partidas em 3 rodadas.
    expect(rows).toHaveLength(6)
    const rodadas = new Set(rows.map((p) => p.rodada))
    expect([...rodadas].sort()).toEqual([1, 2, 3])
    for (const p of rows) {
      expect(p.tournament_id).toBe(TORNEIO)
      expect(p.participante_1).not.toBe(p.participante_2)
      // Nada além das colunas permitidas (status/placar ficam com defaults).
      expect(Object.keys(p).sort()).toEqual([
        "participante_1",
        "participante_2",
        "rodada",
        "tournament_id",
      ])
    }
    // Todas as 6 combinações cobertas (independente do lado).
    const chaves = new Set(
      rows.map((p) => [p.participante_1, p.participante_2].sort().join("|"))
    )
    expect(chaves.size).toBe(6)

    // Promoção filtrada (dono + rascunho) e confirmada por select.
    expect(updateSpy).toHaveBeenCalledWith({ status: "ativo" })
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "status", "rascunho")

    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("ida-e-volta dobra a tabela com returno espelhado", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: true },
      confirmados: [A, B, C, D],
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(12)
    // Cada confronto aparece DUAS vezes, uma por lado.
    const orientados = new Set(
      rows.map((p) => `${p.participante_1}|${p.participante_2}`)
    )
    expect(orientados.size).toBe(12)
    expect(Math.max(...rows.map((p) => p.rodada))).toBe(6)
  })

  it("retry idempotente: tabela já gerada não insere de novo, só promove", async () => {
    const { insertSpy, updateSpy, geradasSpy, fromSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      jaGeradas: true,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(insertSpy).not.toHaveBeenCalled()
    // Nem consulta participants (não há o que gerar).
    expect(fromSpy).not.toHaveBeenCalledWith("participants")
    expect(updateSpy).toHaveBeenCalledWith({ status: "ativo" })
    // A detecção olha partidas com rodada preenchida.
    expect(geradasSpy).toHaveBeenCalledWith("rodada", "is", null)
  })

  it("falha no INSERT da tabela vira mensagem genérica e NÃO promove", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      confirmados: [A, B],
      insertError: true,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(updateSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("falha na promoção vira mensagem genérica (tabela fica para o retry)", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      confirmados: [A, B],
      updateError: true,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
  })

  it("promoção sem linha afetada (corrida/RLS) pede recarga", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      confirmados: [A, B],
      updateData: [],
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/alterado/i)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("erro na detecção de tabela gerada vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      geradasError: true,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("erro na query de participants vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false },
      participantesError: true,
    })
    const r = await iniciarTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
