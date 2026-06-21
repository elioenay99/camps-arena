import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// randInt determinístico: Fisher-Yates com j = randInt(i+1) = i (sem troca) =
// identidade. Permite asserir o payload EXATO do INSERT — a única fonte de
// aleatoriedade das actions é esse gerador injetado.
vi.mock("@/lib/rand", () => ({ randIntCrypto: (n: number) => n - 1 }))

import { revalidatePath } from "next/cache"

import { avancarFase, iniciarMataMata } from "@/actions/tournaments"
import { MATA_MATA_MAX_PARTICIPANTES } from "@/features/knockout/gerarChaveMataMata"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

/** Ids com ordem de code-point conhecida (a..f) para asserções da chave. */
const A = "aaaaaaaa-0000-4000-8000-000000000000"
const B = "bbbbbbbb-0000-4000-8000-000000000000"
const C = "cccccccc-0000-4000-8000-000000000000"
const D = "dddddddd-0000-4000-8000-000000000000"

interface PartidaInserida {
  tournament_id: string
  vaga_1: string
  vaga_2: string | null
  rodada: number
  posicao: number
  perna: number | null
  status?: string
}

interface PartidaPersistida {
  rodada: number | null
  posicao: number | null
  perna: number | null
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  status: string
  wo?: boolean
  wo_vencedor?: string | null
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Lookup do torneio (dono + formato + estado). */
  torneio?:
    | { id: string; ida_e_volta: boolean; terceiro_lugar: boolean; formato?: string }
    | null
  torneioError?: boolean
  /** Partidas com rodada já existentes (detecção de chave gerada). */
  jaGeradas?: boolean
  geradasError?: boolean
  /** Slot ids (vagas) devolvidos por tournament_slots (iniciarMataMata). */
  vagas?: string[]
  vagasError?: boolean
  insertError?: boolean
  /** Código do erro de insert (23505 = corrida; default 42501 = rls). */
  insertCode?: string
  /** Resultado do UPDATE de promoção. */
  updateData?: { id: string }[] | null
  updateError?: boolean
  /** Partidas persistidas devolvidas no avancarFase (select da chave atual). */
  partidas?: PartidaPersistida[] | null
  partidasError?: boolean
  /** true = este torneio é a chave de uma barragem 'pares' (avancarFase recusa). */
  barragemPares?: boolean
}

/**
 * Cliente falso espelhando as interações das duas actions (clube-cêntrico):
 *  - tournaments select: eq(id).eq(created_by).eq(formato).eq(status) —
 *    spies provam propriedade/formato/estado por FILTRO.
 *  - matches select com .not('rodada','is',null).limit(1) → detecção de retry
 *    (iniciarMataMata); o mesmo from('matches').select(...).not(...) sem limit
 *    devolve a chave persistida no avancarFase (lados por VAGA). Distinguimos
 *    pela presença de `partidas` no cenário (avancarFase) vs `jaGeradas`.
 *  - tournament_slots select: eq(tournament_id) → as VAGAS (iniciarMataMata).
 *    avancarFase não consulta vagas (a policy de INSERT valida pertencimento).
 *  - matches insert: payload em lote (a chave / a fase nova, lados por VAGA).
 *  - tournaments update: promoção a 'ativo' com filtros + select de confirmação.
 */
function montarClient(c: Cenario) {
  const filtroTorneioSpy = vi.fn()
  const filtroUpdateSpy = vi.fn()
  const geradasSpy = vi.fn()
  const insertSpy = vi.fn(async (rows: PartidaInserida[]) => {
    void rows
    return {
      error: c.insertError
        ? { message: "boom", code: c.insertCode ?? "42501" }
        : null,
    }
  })

  const cadeiaTorneioSelect = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroTorneioSpy("eq", col, val)
      return cadeiaTorneioSelect
    }),
    in: vi.fn((col: string, val: unknown) => {
      filtroTorneioSpy("in", col, val)
      return cadeiaTorneioSelect
    }),
    maybeSingle: vi.fn(async () => ({
      data: c.torneio ?? null,
      error: c.torneioError ? { message: "down" } : null,
    })),
  }

  // matches select é usado de dois jeitos: com .limit(1) (detecção) e como
  // promise direta após .not(...) (a chave do avancarFase). A cadeia abaixo é
  // thenable: `await cadeia` resolve a chave; `.limit(1)` resolve a detecção.
  const cadeiaMatchesSelect = {
    eq: vi.fn(() => cadeiaMatchesSelect),
    not: vi.fn((col: string, op: string, val: unknown) => {
      geradasSpy(col, op, val)
      return cadeiaMatchesSelect
    }),
    limit: vi.fn(async () => ({
      data: c.geradasError ? null : c.jaGeradas ? [{ id: "m1" }] : [],
      error: c.geradasError ? { message: "down" } : null,
    })),
    then: (
      resolve: (v: {
        data: PartidaPersistida[] | null
        error: { message: string } | null
      }) => unknown
    ) =>
      resolve({
        data: c.partidasError ? null : (c.partidas ?? []),
        error: c.partidasError ? { message: "down" } : null,
      }),
  }

  // league_boundaries (avancarFase): guard da barragem 'pares' — await após
  // .eq().eq().eq().limit(1). Não-vazio ⇒ é barragem 'pares' ⇒ recusa avançar.
  const cadeiaBoundaries = {
    eq: vi.fn(() => cadeiaBoundaries),
    limit: vi.fn(async () => ({
      data: c.barragemPares ? [{ id: "b1" }] : [],
      error: null,
    })),
  }

  // tournament_slots (iniciarMataMata): await após .eq(...) → as vagas.
  const cadeiaVagas = {
    eq: vi.fn(async () => ({
      data: c.vagasError ? null : (c.vagas ?? []).map((id) => ({ id })),
      error: c.vagasError ? { message: "down" } : null,
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
  const matchesSelectSpy = vi.fn(() => cadeiaMatchesSelect)

  const client = {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments")
        return { select: vi.fn(() => cadeiaTorneioSelect), update: updateSpy }
      if (tabela === "tournament_slots")
        return { select: vi.fn(() => cadeiaVagas) }
      if (tabela === "league_boundaries")
        return { select: vi.fn(() => cadeiaBoundaries) }
      return { select: matchesSelectSpy, insert: insertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    insertSpy,
    updateSpy,
    filtroTorneioSpy,
    filtroUpdateSpy,
    geradasSpy,
    matchesSelectSpy,
    fromSpy: client.from,
  }
}

/** Monta um FormData de início de mata-mata (campos do painel). */
function formInicio(campos: {
  tournamentId?: string
  modo?: string
  cabecas?: string[]
  /** Pares [lado1, lado2] do modo manual — "" vira lado vazio (bye). */
  slots?: [string, string][]
}): FormData {
  const fd = new FormData()
  if (campos.tournamentId !== undefined)
    fd.set("tournamentId", campos.tournamentId)
  if (campos.modo !== undefined) fd.set("modo", campos.modo)
  for (const cabeca of campos.cabecas ?? []) fd.append("cabecas", cabeca)
  campos.slots?.forEach(([l1, l2], i) => {
    fd.set(`slot_${i + 1}_1`, l1)
    fd.set(`slot_${i + 1}_2`, l2)
  })
  return fd
}

/** Linha encerrada com lado 1 vencendo (ou bye/volta 0x0). Lados por VAGA. */
function jogada(p: Partial<PartidaPersistida>): PartidaPersistida {
  return {
    rodada: 1,
    posicao: 1,
    perna: null,
    vaga_1: A,
    vaga_2: B,
    placar_1: 1,
    placar_2: 0,
    status: "encerrada",
    ...p,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("iniciarMataMata", () => {
  it("FormData sem modo válido rejeita no Zod, sem tocar o banco", async () => {
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "invalido" })
    )
    expect(r.error).toMatch(/inválidos/i)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({ user: null })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/autenticado/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("não-dono/alheio/não-rascunho: resposta única via FILTRO, sem escrever", async () => {
    const { insertSpy, updateSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toBe(
      "Torneio não encontrado, já iniciado ou você não é o dono dele."
    )
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    // Formato + estado por FILTRO; a posse vem da capacidade GERIR (via RPC).
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "formato", "mata_mata")
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "status", "rascunho")
  })

  it("erro no lookup do torneio vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneioError: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("retry idempotente: chave já gerada não insere de novo, só promove", async () => {
    const { insertSpy, updateSpy, geradasSpy, fromSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      jaGeradas: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r).toEqual({})
    expect(insertSpy).not.toHaveBeenCalled()
    // Não consulta as vagas (não há o que gerar).
    expect(fromSpy).not.toHaveBeenCalledWith("tournament_slots")
    expect(updateSpy).toHaveBeenCalledWith({ status: "ativo" })
    // A detecção olha partidas com rodada preenchida.
    expect(geradasSpy).toHaveBeenCalledWith("rodada", "is", null)
  })

  it("erro na detecção de chave gerada vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      geradasError: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("erro na query das vagas vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagasError: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("menos de 2 clubes rejeita com orientação, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/pelo menos 2 clubes/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("acima de 32 participantes rejeita, sem escrever", async () => {
    const muitos = Array.from(
      { length: MATA_MATA_MAX_PARTICIPANTES + 1 },
      (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`
    )
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: muitos,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/no máximo/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("sorteio N=3: insere bye encerrado + confronto e promove (payload determinístico)", async () => {
    const { insertSpy, updateSpy, filtroUpdateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      // Desordenados: a action ordena por code-point antes do motor.
      vagas: [C, A, B],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r).toEqual({})

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const rows = insertSpy.mock.calls[0][0]
    // Chave de 4 (s=4), 2 slots, 1 bye no slot 1; identidade preserva [A,B,C].
    expect(rows).toHaveLength(2)
    // Bye: lado 1 = A, lado 2 nulo, nasce encerrada (memória durável do slot).
    expect(rows[0]).toEqual({
      tournament_id: TORNEIO,
      vaga_1: A,
      vaga_2: null,
      rodada: 1,
      posicao: 1,
      perna: null,
      status: "encerrada",
    })
    // Confronto real: B x C, sem status (fica com o default 'agendada').
    expect(rows[1]).toEqual({
      tournament_id: TORNEIO,
      vaga_1: B,
      vaga_2: C,
      rodada: 1,
      posicao: 2,
      perna: null,
    })
    expect(rows[1]).not.toHaveProperty("status")

    expect(updateSpy).toHaveBeenCalledWith({ status: "ativo" })
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "status", "rascunho")

    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios")
    expect(mockRevalidate).toHaveBeenCalledWith(
      `/dashboard/torneios/${TORNEIO}`
    )
  })

  it("potes N=4 com 2 cabeças: todo confronto cruza cabeça × não-cabeça", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "potes", cabecas: [A, B] })
    )
    expect(r).toEqual({})
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    const cabecasSet = new Set([A, B])
    for (const p of rows) {
      // Exatamente um lado é cabeça (estreia nunca cruza duas cabeças).
      const c1 = cabecasSet.has(p.vaga_1)
      const c2 = p.vaga_2 !== null && cabecasSet.has(p.vaga_2)
      expect(c1).not.toBe(c2)
    }
    // Sorteado por potes determinístico: A×C (pos1), B×D (pos2).
    expect(rows[0]).toMatchObject({
      vaga_1: A,
      vaga_2: C,
      posicao: 1,
    })
    expect(rows[1]).toMatchObject({
      vaga_1: B,
      vaga_2: D,
      posicao: 2,
    })
  })

  it("potes com cabeças != metade rejeita (motor exige metade exata)", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "potes", cabecas: [A] })
    )
    expect(r.error).toMatch(/metade/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("potes com N=6 (fora de 4/8/16/32) rejeita, sem escrever", async () => {
    const E = "eeeeeeee-0000-4000-8000-000000000000"
    const F = "ffffffff-0000-4000-8000-000000000000"
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D, E, F],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({
        tournamentId: TORNEIO,
        modo: "potes",
        cabecas: [A, B, C],
      })
    )
    expect(r.error).toMatch(/4, 8, 16, 32/)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("potes com cabeça fora da lista de participantes rejeita", async () => {
    const FORA = "ffffffff-0000-4000-8000-000000000000"
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({
        tournamentId: TORNEIO,
        modo: "potes",
        cabecas: [A, FORA],
      })
    )
    expect(r.error).toMatch(/fora da lista/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("potes com cabeça repetida rejeita", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({
        tournamentId: TORNEIO,
        modo: "potes",
        cabecas: [A, A],
      })
    )
    expect(r.error).toMatch(/repetida/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("manual com partição válida: insere os confrontos do form e promove", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({
        tournamentId: TORNEIO,
        modo: "manual",
        slots: [
          [A, D],
          [B, C],
        ],
      })
    )
    expect(r).toEqual({})
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      vaga_1: A,
      vaga_2: D,
      posicao: 1,
    })
    expect(rows[1]).toMatchObject({
      vaga_1: B,
      vaga_2: C,
      posicao: 2,
    })
    expect(updateSpy).toHaveBeenCalledWith({ status: "ativo" })
  })

  it("manual com partição inválida (participante de fora) rejeita, sem escrever", async () => {
    const FORA = "ffffffff-0000-4000-8000-000000000000"
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({
        tournamentId: TORNEIO,
        modo: "manual",
        slots: [
          [A, FORA],
          [B, C],
        ],
      })
    )
    expect(r.error).toMatch(/somente eles|confronto/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("23505 no INSERT da chave vira mensagem 'já foi gerada'", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
      insertError: true,
      insertCode: "23505",
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/já foi gerada/i)
    expect(updateSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("erro genérico no INSERT da chave vira mensagem genérica e NÃO promove", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
      insertError: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(updateSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("promoção sem linha afetada (corrida/RLS) pede recarga e não revalida", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
      updateData: [],
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/alterado/i)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("falha na promoção (erro do update) vira mensagem genérica", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      vagas: [A, B, C, D],
      updateError: true,
    })
    const r = await iniciarMataMata(
      {},
      formInicio({ tournamentId: TORNEIO, modo: "sorteio" })
    )
    expect(r.error).toMatch(/não foi possível/i)
  })
})

describe("avancarFase", () => {
  it("uuid inválido rejeita sem tocar o banco", async () => {
    const r = await avancarFase("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const { insertSpy } = montarClient({ user: null })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autenticado/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("torneio filtrado por dono + mata_mata + ATIVO: resposta única, sem escrever", async () => {
    const { insertSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await avancarFase(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, não iniciado ou você não é o dono dele.",
    })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("in", "formato", [
      "mata_mata",
      "grupos_mata_mata",
      "fase_liga",
    ])
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "status", "ativo")
  })

  it("chave não gerada (0 partidas) vira erro próprio, sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: {
        id: TORNEIO,
        ida_e_volta: false,
        terceiro_lugar: false,
        formato: "mata_mata",
      },
      partidas: [],
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ainda não foi gerada/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("formato de grupos sem chave orienta a gerar o mata-mata primeiro", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: {
        id: TORNEIO,
        ida_e_volta: false,
        terceiro_lugar: false,
        formato: "grupos_mata_mata",
      },
      // Só partidas de GRUPO (posicao null): a chave ainda não existe.
      partidas: [jogada({ posicao: null, vaga_1: A, vaga_2: B })],
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/gere o mata-mata/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("fase incompleta vira a mensagem do motor (sem vencedor), sem escrever", async () => {
    // Chave de 4: slot 1 encerrado, slot 2 ainda em andamento → sem vencedor.
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }),
        jogada({
          posicao: 2,
          vaga_1: C,
          vaga_2: D,
          status: "em_andamento",
        }),
      ],
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/sem vencedor/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("chave de 4 encerrada gera a final com os vencedores certos", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }), // A vence
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }), // C vence
      ],
      vagas: [A, B, C, D],
    })
    const r = await avancarFase(TORNEIO)
    expect(r).toEqual({ ok: true })
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tournament_id: TORNEIO,
      rodada: 2,
      posicao: 1,
      perna: null,
      vaga_1: A,
      vaga_2: C,
    })
    // avancarFase NÃO promove status (já está ativo).
    expect(updateSpy).not.toHaveBeenCalled()
    expect(mockRevalidate).toHaveBeenCalledWith(
      `/dashboard/torneios/${TORNEIO}`
    )
  })

  it("recusa avançar fase numa barragem 'pares' (rodada única, sem fase 2)", async () => {
    // BLOCKER (Fase 3): a chave da barragem 'pares' é um mata_mata com B
    // confrontos 1×1 numa rodada única. Sem o guard, avancarFase geraria uma
    // fase 2 espúria pareando vencedores de pares distintos — corrompendo o
    // resultado e travando o fluxo da temporada.
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }), // par 1
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }), // par 2
      ],
      barragemPares: true,
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/barragem|rodada única|não há fase/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("W.O. numa partida da fase decide o confronto e avança o vencedor do W.O.", async () => {
    // Regressão: avancarFase precisa LER wo/wo_vencedor. Sem isso a perna W.O.
    // (0x0) vira jogo único empatado → decidirConfronto devolve null → a fase
    // trava em "sem vencedor". Com a leitura, C (vencedor do W.O.) avança.
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }), // A vence no placar
        jogada({
          posicao: 2,
          vaga_1: C,
          vaga_2: D,
          placar_1: 0,
          placar_2: 0,
          wo: true,
          wo_vencedor: C, // C vence por W.O. — D ficou órfão / não compareceu
        }),
      ],
      vagas: [A, B, C, D],
    })
    const r = await avancarFase(TORNEIO)
    expect(r).toEqual({ ok: true })
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ rodada: 2, posicao: 1, vaga_1: A, vaga_2: C })
  })

  it("semifinais + terceiro_lugar gera final E disputa de 3º com os perdedores", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: true },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }), // A vence, B perde
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }), // C vence, D perde
      ],
      vagas: [A, B, C, D],
    })
    const r = await avancarFase(TORNEIO)
    expect(r).toEqual({ ok: true })
    const rows = insertSpy.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    const final = rows.find((p) => p.posicao === 1)
    const terceiro = rows.find((p) => p.posicao === 2)
    expect(final).toMatchObject({ vaga_1: A, vaga_2: C })
    // 3º lugar reúne os perdedores das semis (jogo único).
    expect(terceiro).toMatchObject({
      rodada: 2,
      perna: null,
      vaga_1: B,
      vaga_2: D,
    })
  })

  it("final já disputada vira 'já está decidido', sem escrever", async () => {
    // Chave de 2: a 1ª fase JÁ é a final encerrada → nada a gerar.
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ rodada: 1, posicao: 1, vaga_1: A, vaga_2: B }),
      ],
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já está decidido/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("23505 no INSERT da fase vira 'já foi avançada'", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }),
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }),
      ],
      vagas: [A, B, C, D],
      insertError: true,
      insertCode: "23505",
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já foi avançada/i)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it("erro genérico no INSERT da fase vira mensagem genérica", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }),
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }),
      ],
      vagas: [A, B, C, D],
      insertError: true,
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    consoleSpy.mockRestore()
  })

  it("erro no select das partidas vira mensagem genérica, sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidasError: true,
    })
    const r = await avancarFase(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  // Modelo clube-cêntrico: NÃO há mais pré-checagem de "semeados em
  // participants" no avancarFase. As vagas são imutáveis pós-rascunho e a
  // policy de INSERT valida que cada vaga pertence ao torneio — os testes de
  // "semeado que sumiu" e "erro na pré-checagem" foram removidos.

  it("caminho feliz revalida as três rotas", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, ida_e_volta: false, terceiro_lugar: false },
      partidas: [
        jogada({ posicao: 1, vaga_1: A, vaga_2: B }),
        jogada({ posicao: 2, vaga_1: C, vaga_2: D }),
      ],
      vagas: [A, B, C, D],
    })
    const r = await avancarFase(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios")
    expect(mockRevalidate).toHaveBeenCalledWith(
      `/dashboard/torneios/${TORNEIO}`
    )
  })
})
