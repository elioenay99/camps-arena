import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// randInt determinístico: Fisher-Yates com j = randInt(i+1) = i (sem troca) =
// identidade. Com isso o sorteio de grupos e o desempate da linha de corte
// ficam previsíveis e o payload EXATO do INSERT é asserível — a única fonte de
// aleatoriedade das actions é esse gerador injetado.
vi.mock("@/lib/rand", () => ({ randIntCrypto: (n: number) => n - 1 }))

import { revalidatePath } from "next/cache"

import {
  gerarMataMataDosGrupos,
  iniciarTorneioGrupos,
} from "@/actions/tournaments"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"

/** Ids com ordem de code-point conhecida (a..d) para asserções da chave. */
const A = "aaaaaaaa-0000-4000-8000-000000000000"
const B = "bbbbbbbb-0000-4000-8000-000000000000"
const C = "cccccccc-0000-4000-8000-000000000000"
const D = "dddddddd-0000-4000-8000-000000000000"

interface PartidaInseridaGrupo {
  tournament_id: string
  vaga_1: string
  vaga_2: string
  grupo: number
  rodada: number
}

interface PartidaInseridaChave {
  tournament_id: string
  vaga_1: string
  vaga_2: string | null
  rodada: number
  posicao: number
  perna: number | null
}

/** Linha persistida de partida (grupo OU chave) — insumo de gerarMataMata. */
interface PartidaPersistida {
  grupo: number | null
  rodada: number | null
  posicao: number | null
  vaga_1: string | null
  vaga_2: string | null
  placar_1: number
  placar_2: number
  status: string
  wo?: boolean
  wo_vencedor?: string | null
}

interface Torneio {
  id: string
  formato?: string
  status?: string
  ida_e_volta: boolean
  terceiro_lugar?: boolean
  classificados_por_grupo?: number | null
  pontos_vitoria?: number
  pontos_empate?: number
  pontos_derrota?: number
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Lookup do torneio (dono + formato + estado). */
  torneio?: Torneio | null
  torneioError?: boolean
  /** iniciarTorneioGrupos: partidas com rodada já existem (idempotência). */
  jaGeradas?: boolean
  geradasError?: boolean
  /** iniciarTorneioGrupos: slot ids (vagas) devolvidos por tournament_slots. */
  vagas?: string[]
  vagasError?: boolean
  /** gerarMataMataDosGrupos: partidas persistidas (grupos e/ou chave). */
  partidas?: PartidaPersistida[] | null
  partidasError?: boolean
  insertError?: boolean
  /** Código do erro de insert (23505 = corrida; default 42501 = rls). */
  insertCode?: string
  /** Resultado do UPDATE de promoção (iniciarTorneioGrupos). */
  updateData?: { id: string }[] | null
  /** Resultados de updates SUCESSIVOS (recuperação: rebaixa → promove). */
  updateDataPorChamada?: ({ id: string }[] | null)[]
  updateError?: boolean
}

/**
 * Cliente falso espelhando as interações das duas actions de grupos.
 *
 *  - tournaments select: eq(id).eq(created_by).in(formato).eq(status) — os
 *    spies provam propriedade/formato/estado por FILTRO no servidor.
 *  - matches select: iniciarTorneioGrupos usa .eq(...).not(...).limit(1) para
 *    detectar geração prévia; gerarMataMataDosGrupos usa .eq(...).not(...) sem
 *    limit (thenable) para ler as partidas persistidas. A cadeia abaixo é
 *    thenable: `await cadeia` resolve as partidas; `.limit(1)` resolve a
 *    detecção (presença de `jaGeradas` no cenário) — distinguimos pela action
 *    exercida no teste.
 *  - tournament_slots select: iniciarTorneioGrupos dá await após .eq(...) —
 *    as VAGAS (slot ids opacos). gerarMataMataDosGrupos NÃO consulta vagas
 *    (imutáveis pós-rascunho; existem por construção).
 *  - matches insert: payload em lote (grupos ou chave), lados por VAGA.
 *  - tournaments update: promoção a 'ativo' + classificados_por_grupo.
 */
function montarClient(c: Cenario) {
  const filtroTorneioSpy = vi.fn()
  const filtroUpdateSpy = vi.fn()
  const geradasSpy = vi.fn()
  const updatePayloadSpy = vi.fn()
  const insertSpy = vi.fn(
    async (rows: PartidaInseridaGrupo[] | PartidaInseridaChave[]) => {
      void rows
      return {
        error: c.insertError
          ? { message: "boom", code: c.insertCode ?? "42501" }
          : null,
      }
    }
  )

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

  const cadeiaVagas = {
    eq: vi.fn(async () => ({
      data: c.vagasError ? null : (c.vagas ?? []).map((id) => ({ id })),
      error: c.vagasError ? { message: "down" } : null,
    })),
  }

  let chamadaUpdate = 0
  const cadeiaUpdate = {
    eq: vi.fn((col: string, val: unknown) => {
      filtroUpdateSpy("eq", col, val)
      return cadeiaUpdate
    }),
    select: vi.fn(async () => ({
      data: c.updateError
        ? null
        : (c.updateDataPorChamada?.[chamadaUpdate++] ??
          c.updateData ??
          [{ id: TORNEIO }]),
      error: c.updateError ? { message: "down" } : null,
    })),
  }
  const updateSpy = vi.fn((payload: unknown) => {
    updatePayloadSpy(payload)
    return cadeiaUpdate
  })
  const matchesSelectSpy = vi.fn(() => cadeiaMatchesSelect)

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
      if (tabela === "tournament_slots")
        return { select: vi.fn(() => cadeiaVagas) }
      return { select: matchesSelectSpy, insert: insertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    insertSpy,
    updateSpy,
    updatePayloadSpy,
    filtroTorneioSpy,
    filtroUpdateSpy,
    geradasSpy,
    matchesSelectSpy,
    fromSpy: client.from,
  }
}

/** Monta o FormData de início de grupos (campos do painel). */
function formGrupos(campos: {
  tournamentId?: string
  modo?: string
  qtdGrupos?: number
  classificadosPorGrupo?: number
  cabecas?: string[]
  /** Modo manual: par [slot id (vaga), nº do grupo]. */
  atribuicao?: [string, number][]
}): FormData {
  const fd = new FormData()
  if (campos.tournamentId !== undefined)
    fd.set("tournamentId", campos.tournamentId)
  if (campos.modo !== undefined) fd.set("modo", campos.modo)
  if (campos.qtdGrupos !== undefined)
    fd.set("qtdGrupos", String(campos.qtdGrupos))
  if (campos.classificadosPorGrupo !== undefined)
    fd.set("classificadosPorGrupo", String(campos.classificadosPorGrupo))
  for (const cabeca of campos.cabecas ?? []) fd.append("cabecas", cabeca)
  for (const [id, g] of campos.atribuicao ?? [])
    fd.set(`grupo_de_${id}`, String(g))
  return fd
}

/** Linha de partida de GRUPO encerrada (placar configurável), lados por VAGA. */
function jogoGrupo(p: Partial<PartidaPersistida>): PartidaPersistida {
  return {
    grupo: 1,
    rodada: 1,
    posicao: null,
    vaga_1: A,
    vaga_2: B,
    placar_1: 1,
    placar_2: 0,
    status: "encerrada",
    ...p,
  }
}

/** Torneio de grupos ATIVO já com K gravado (insumo de gerarMataMata). */
function torneioAtivo(over: Partial<Torneio> = {}): Torneio {
  return {
    id: TORNEIO,
    ida_e_volta: false,
    terceiro_lugar: false,
    classificados_por_grupo: 1,
    pontos_vitoria: 3,
    pontos_empate: 1,
    pontos_derrota: 0,
    ...over,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("iniciarTorneioGrupos", () => {
  it("FormData inválido (modo fora do enum) rejeita no Zod, sem tocar o banco", async () => {
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "xpto",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/inválidos/i)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({ user: null })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/autenticado/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("propriedade/formato/estado conferidos por FILTRO; torneio ausente vira resposta única", async () => {
    const { insertSpy, updateSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toBe(
      "Torneio não encontrado, já iniciado ou você não é o dono dele."
    )
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    // Dono e estado conferidos no servidor; formato restrito aos de grupos.
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("in", "formato", [
      "grupos_mata_mata",
      "fase_liga",
    ])
    // 'ativo' também entra: é o estado de RECUPERAÇÃO do promote-first.
    expect(filtroTorneioSpy).toHaveBeenCalledWith("in", "status", [
      "rascunho",
      "ativo",
    ])
  })

  it("erro no lookup do torneio vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneioError: true,
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("fase_liga com qtdGrupos != 1 rejeita (grupo único)", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "fase_liga", ida_e_volta: false },
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 4,
      })
    )
    expect(r.error).toMatch(/grupo único/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("erro na detecção de geração prévia vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      geradasError: true,
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("partidas já geradas: nada a fazer (promote-first garantiu K/status antes delas)", async () => {
    const { insertSpy, updateSpy, geradasSpy, fromSpy } =
      montarClient({
        user: { id: DONO },
        torneio: {
          id: TORNEIO,
          formato: "grupos_mata_mata",
          ida_e_volta: false,
        },
        jaGeradas: true,
      })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    // No fluxo promote-first, partidas existentes implicam status/K gravados
    // ANTES delas — o re-run apenas orienta, sem escrever nada.
    expect(r.error).toMatch(/já foi iniciado/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    // Não consulta as vagas (não há o que gerar).
    expect(fromSpy).not.toHaveBeenCalledWith("tournament_slots")
    // A detecção olha partidas com rodada preenchida.
    expect(geradasSpy).toHaveBeenCalledWith("rodada", "is", null)
  })

  it("erro na query de vagas vira mensagem genérica, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagasError: true,
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("menos de 2 clubes rejeita com orientação, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/pelo menos 2 clubes/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("geometria inválida (G·K fora de 2/4/8/16/32) vira a mensagem do motor, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    // 2 grupos × 3 classificados = 6 → fora da chave completa (motor lança).
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 3,
      })
    )
    expect(r.error).toMatch(/chave completa/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("modo sorteio N=4 G=2 K=1: payload EXATO do INSERT dos grupos e promoção", async () => {
    const { insertSpy, updatePayloadSpy, filtroUpdateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      // Desordenados: a action ordena por code-point antes do motor.
      vagas: [C, A, D, B],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r).toEqual({})

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const rows = insertSpy.mock.calls[0][0] as PartidaInseridaGrupo[]
    // identidade: [A,B,C,D] → round-robin G=2 distribui [A,C] (G1) e [B,D] (G2).
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      tournament_id: TORNEIO,
      vaga_1: A,
      vaga_2: C,
      grupo: 1,
      rodada: 1,
    })
    expect(rows[1]).toEqual({
      tournament_id: TORNEIO,
      vaga_1: B,
      vaga_2: D,
      grupo: 2,
      rodada: 1,
    })

    // Promoção grava status ativo E o K (mesma escrita).
    expect(updatePayloadSpy).toHaveBeenCalledWith({
      status: "ativo",
      classificados_por_grupo: 1,
    })
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroUpdateSpy).toHaveBeenCalledWith("eq", "status", "rascunho")

    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard/torneios")
    expect(mockRevalidate).toHaveBeenCalledWith(
      `/dashboard/torneios/${TORNEIO}`
    )
  })

  it("modo potes com cabeças != G rejeita (uma cabeça por grupo)", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    // G=2 exige 2 cabeças; só uma marcada.
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "potes",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
        cabecas: [A],
      })
    )
    expect(r.error).toMatch(/exatamente 2 cabeças/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("modo potes com cabeça fora da lista rejeita, sem escrever", async () => {
    const FORA = "ffffffff-0000-4000-8000-000000000000"
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "potes",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
        cabecas: [A, FORA],
      })
    )
    expect(r.error).toMatch(/fora da lista/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("modo manual N=4 G=2 K=1: insere os grupos do form e promove", async () => {
    const { insertSpy, updatePayloadSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    // grupo 1 = {A,B}; grupo 2 = {C,D} (partição equilibrada).
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "manual",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
        atribuicao: [
          [A, 1],
          [B, 1],
          [C, 2],
          [D, 2],
        ],
      })
    )
    expect(r).toEqual({})
    const rows = insertSpy.mock.calls[0][0] as PartidaInseridaGrupo[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      vaga_1: A,
      vaga_2: B,
      grupo: 1,
      rodada: 1,
    })
    expect(rows[1]).toMatchObject({
      vaga_1: C,
      vaga_2: D,
      grupo: 2,
      rodada: 1,
    })
    expect(updatePayloadSpy).toHaveBeenCalledWith({
      status: "ativo",
      classificados_por_grupo: 1,
    })
  })

  it("modo manual com grupo inexistente (índice > G) rejeita, sem escrever", async () => {
    const { insertSpy, updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    // G=2 mas D foi atribuído ao grupo 3.
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "manual",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
        atribuicao: [
          [A, 1],
          [B, 1],
          [C, 2],
          [D, 3],
        ],
      })
    )
    expect(r.error).toMatch(/Grupo 3 não existe/i)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("23505 no INSERT dos grupos vira 'já foram gerados', sem promover", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { updateSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
      insertError: true,
      insertCode: "23505",
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    // Promote-first: o INSERT falho deixa 'ativo' sem partidas — a mensagem
    // orienta re-tentar (o re-run rebaixa e refaz).
    expect(r.error).toMatch(/tente novamente/i)
    expect(updateSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it("promoção sem linha afetada (corrida/RLS) pede recarga e não revalida", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
      updateData: [],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    // 0 linhas na promoção = perdedor da corrida: aborta SEM inserir.
    expect(r.error).toMatch(/já foi iniciado/i)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })

  it("falha na promoção (erro do update) vira mensagem genérica", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
      updateError: true,
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/não foi possível/i)
    expect(mockRevalidate).not.toHaveBeenCalled()
  })
})

describe("iniciarTorneioGrupos — promote-first (corrida e recuperação)", () => {
  it("vencedor da corrida: PROMOVE antes de inserir (ordem das escritas)", async () => {
    const ordem: string[] = []
    const { updateSpy, insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    updateSpy.mockImplementation(() => {
      ordem.push("update")
      return {
        eq: vi.fn().mockReturnThis(),
        select: vi.fn(async () => ({ data: [{ id: TORNEIO }], error: null })),
      } as never
    })
    insertSpy.mockImplementation(async () => {
      ordem.push("insert")
      return { error: null }
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r).toEqual({})
    // A promoção é a SERIALIZAÇÃO da corrida — precisa vir antes do INSERT
    // (o índice de par único não barra partições divergentes de sorteio).
    expect(ordem).toEqual(["update", "insert"])
  })

  it("recuperação de crash: ATIVO sem partidas → rebaixa, repromove e insere", async () => {
    const { updatePayloadSpy, insertSpy } = montarClient({
      user: { id: DONO },
      torneio: {
        id: TORNEIO,
        formato: "grupos_mata_mata",
        status: "ativo",
        ida_e_volta: false,
      },
      vagas: [A, B, C, D],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r).toEqual({})
    expect(updatePayloadSpy.mock.calls.map((c) => c[0])).toEqual([
      { status: "rascunho" },
      { status: "ativo", classificados_por_grupo: 1 },
    ])
    expect(insertSpy).toHaveBeenCalledTimes(1)
  })

  it("recuperador que perde o rebaixamento (0 linhas) aborta sem escrever partidas", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: {
        id: TORNEIO,
        formato: "grupos_mata_mata",
        status: "ativo",
        ida_e_volta: false,
      },
      vagas: [A, B, C, D],
      updateDataPorChamada: [[]],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 2,
        classificadosPorGrupo: 1,
      })
    )
    expect(r.error).toMatch(/recarregue/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("grupos_mata_mata com G=1 orienta a usar o formato Fase de liga", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "grupos_mata_mata", ida_e_volta: false },
      vagas: [A, B, C, D],
    })
    const r = await iniciarTorneioGrupos(
      {},
      formGrupos({
        tournamentId: TORNEIO,
        modo: "sorteio",
        qtdGrupos: 1,
        classificadosPorGrupo: 2,
      })
    )
    expect(r.error).toMatch(/fase de liga/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

describe("gerarMataMataDosGrupos", () => {
  it("uuid inválido rejeita sem tocar o banco", async () => {
    const r = await gerarMataMataDosGrupos("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita", async () => {
    const { insertSpy } = montarClient({ user: null })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autenticado/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("torneio filtrado por dono + formato de grupos + ATIVO: resposta única, sem escrever", async () => {
    const { insertSpy, filtroTorneioSpy } = montarClient({
      user: { id: DONO },
      torneio: null,
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Torneio não encontrado, não iniciado ou você não é o dono dele.",
    })
    expect(insertSpy).not.toHaveBeenCalled()
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "created_by", DONO)
    expect(filtroTorneioSpy).toHaveBeenCalledWith("in", "formato", [
      "grupos_mata_mata",
      "fase_liga",
    ])
    expect(filtroTorneioSpy).toHaveBeenCalledWith("eq", "status", "ativo")
  })

  it("classificados_por_grupo null vira mensagem genérica, sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo({ classificados_por_grupo: null }),
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("sem partidas de grupo orienta a gerar a fase de grupos primeiro", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ainda não foi gerada/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("chave já existente (partida com posicao) vira 'já foi gerado', sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({ grupo: 1, vaga_1: A, vaga_2: C }),
        jogoGrupo({ grupo: 2, vaga_1: B, vaga_2: D }),
        // Partida de chave já presente (grupo null, posicao preenchida).
        jogoGrupo({
          grupo: null,
          rodada: 2,
          posicao: 1,
          vaga_1: A,
          vaga_2: B,
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já foi gerado/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("jogos de grupo pendentes viram mensagem com a contagem, sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({ grupo: 1, vaga_1: A, vaga_2: C }),
        jogoGrupo({
          grupo: 2,
          vaga_1: B,
          vaga_2: D,
          status: "em_andamento",
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/falta 1 jogo/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("caminho feliz G=2 K=1: chave em RODADA CONTÍNUA (rodadaBase = max grupos + 1)", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      // G1 = {A,C}: A vence. G2 = {B,D}: B vence. Rodada de grupos = 1.
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 2,
          placar_2: 0,
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 2,
          placar_2: 0,
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r).toEqual({ ok: true, sorteioUsado: false })

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const rows = insertSpy.mock.calls[0][0] as PartidaInseridaChave[]
    // G>=2 cruza A (1º G1) × B (1º G2); chave de 2 = jogo único na rodada 2.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      tournament_id: TORNEIO,
      vaga_1: A,
      vaga_2: B,
      rodada: 2,
      posicao: 1,
      perna: null,
    })
    expect(mockRevalidate).toHaveBeenCalledWith(
      `/dashboard/torneios/${TORNEIO}`
    )
  })

  it("W.O. na fase de grupos conta como vitória nos pontos (não empate) na classificação", async () => {
    // Regressão: gerarMataMataDosGrupos precisa LER wo/wo_vencedor para o motor.
    // Sem isso o 0x0 do W.O. vira EMPATE → A e C ficam com 1 ponto cada, empate
    // na linha de corte → sorteio classifica A (1º por id). Lendo o W.O.,
    // C soma a vitória (3 pts), vence o grupo e entra na chave — sem sorteio.
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 0,
          placar_2: 0,
          wo: true,
          wo_vencedor: C, // A ficou órfão → C vence o confronto por W.O.
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 2,
          placar_2: 0,
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r).toEqual({ ok: true, sorteioUsado: false })
    const rows = insertSpy.mock.calls[0][0] as PartidaInseridaChave[]
    expect(rows).toHaveLength(1)
    // C (vencedor do W.O.) e B classificam; A NÃO — sem o fix A entraria no lugar.
    const vagas = [rows[0].vaga_1, rows[0].vaga_2]
    expect(vagas).toContain(C)
    expect(vagas).toContain(B)
    expect(vagas).not.toContain(A)
  })

  it("empate total na linha de corte sinaliza sorteioUsado=true (chave ainda gerada)", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      // Ambos os grupos empatam 1x1: K=1 corta um bloco de 2 empatados →
      // sorteio (identidade preserva o 1º por id: A em G1, B em G2).
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 1,
          placar_2: 1,
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 1,
          placar_2: 1,
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r).toEqual({ ok: true, sorteioUsado: true })
    const rows = insertSpy.mock.calls[0][0] as PartidaInseridaChave[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ vaga_1: A, vaga_2: B })
  })

  it("gera SEM pré-checagem de elenco: vagas são imutáveis por construção", async () => {
    // Modelo clube-cêntrico: a pré-checagem de "semeados em participants"
    // MORREU — técnico sai/troca sem afetar a vaga, então a geração da chave
    // não consulta participants nem tournament_slots (a policy de INSERT
    // valida que cada vaga pertence ao torneio).
    const { insertSpy, fromSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 2,
          placar_2: 0,
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 2,
          placar_2: 0,
        }),
      ],
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r).toEqual({ ok: true, sorteioUsado: false })
    expect(insertSpy).toHaveBeenCalledTimes(1)
    expect(fromSpy).not.toHaveBeenCalledWith("participants")
    expect(fromSpy).not.toHaveBeenCalledWith("tournament_slots")
  })

  it("erro no select das partidas vira mensagem genérica, sem escrever", async () => {
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidasError: true,
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("23505 no INSERT da chave vira 'já foi gerado'", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const { insertSpy } = montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 2,
          placar_2: 0,
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 2,
          placar_2: 0,
        }),
      ],
      insertError: true,
      insertCode: "23505",
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já foi gerado/i)
    expect(insertSpy).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })

  it("erro genérico no INSERT da chave vira mensagem genérica", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({
      user: { id: DONO },
      torneio: torneioAtivo(),
      partidas: [
        jogoGrupo({
          grupo: 1,
          rodada: 1,
          vaga_1: A,
          vaga_2: C,
          placar_1: 2,
          placar_2: 0,
        }),
        jogoGrupo({
          grupo: 2,
          rodada: 1,
          vaga_1: B,
          vaga_2: D,
          placar_1: 2,
          placar_2: 0,
        }),
      ],
      insertError: true,
    })
    const r = await gerarMataMataDosGrupos(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    consoleSpy.mockRestore()
  })
})
