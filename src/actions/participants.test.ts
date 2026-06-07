import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import { revalidatePath } from "next/cache"

import {
  aceitarConvite,
  participarDoProprioTorneio,
  regenerarConvite,
  removerParticipante,
  sairDoTorneio,
} from "@/actions/participants"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const DONO = "22222222-2222-4222-8222-222222222222"
const ALVO = "33333333-3333-4333-8333-333333333333"
const CODIGO = "abc123def456ghj7"

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Retorno da RPC aceitar_convite. */
  rpcData?: string | null
  rpcError?: string | null
  rpcThrows?: boolean
  /** Lookup de tournaments (propriedade por filtro / gate de chave gerada). */
  torneio?: { id: string; formato?: string; status?: string } | null
  torneioError?: boolean
  /** Há partidas geradas (com rodada)? Gate de mata-mata encerrado. */
  jaGeradas?: boolean
  geradasError?: boolean
  /** Linhas afetadas pelo delete (select de confirmação). */
  deleteLinhas?: Array<{ user_id: string }>
  deleteError?: boolean
  /** Códigos de erro dos upserts sucessivos (null = sucesso). */
  upsertErros?: (string | null)[]
}

function montarClient(c: Cenario) {
  const rpcSpy = vi.fn(async () => {
    if (c.rpcThrows) throw new Error("conexão caiu")
    return {
      data: c.rpcError ? null : (c.rpcData ?? null),
      error: c.rpcError ? { message: c.rpcError } : null,
    }
  })
  const filtroSpy = vi.fn()
  // Cada select de tournaments abre uma cadeia NOVA que rastreia os próprios
  // filtros: o gate chaveEmAndamento filtra por formato=mata_mata e o mock
  // honra esse filtro (torneio de outro formato → null), espelhando o banco.
  const tournamentsSelect = vi.fn(() => {
    const filtros: Array<[string, unknown]> = []
    const cadeia = {
      eq: vi.fn((col: string, val: unknown) => {
        filtroSpy("eq", col, val)
        filtros.push([col, val])
        return cadeia
      }),
      neq: vi.fn((col: string, val: unknown) => {
        filtroSpy("neq", col, val)
        return cadeia
      }),
      in: vi.fn((col: string, val: unknown) => {
        filtroSpy("in", col, val)
        filtros.push([`in:${col}`, val])
        return cadeia
      }),
      maybeSingle: vi.fn(async () => {
        const incompativel = filtros.some(
          ([col, val]) =>
            (col === "formato" &&
              (c.torneio?.formato ?? "avulso") !== val) ||
            (col === "in:formato" &&
              !(val as string[]).includes(c.torneio?.formato ?? "avulso"))
        )
        return {
          data: incompativel ? null : (c.torneio ?? null),
          error: c.torneioError ? { message: "down" } : null,
        }
      }),
    }
    return cadeia
  })
  // Detecção de partidas geradas (gate de mata-mata encerrado).
  const cadeiaMatches = {
    eq: vi.fn(() => cadeiaMatches),
    not: vi.fn(() => cadeiaMatches),
    limit: vi.fn(async () => ({
      data: c.geradasError ? null : c.jaGeradas ? [{ id: "m1" }] : [],
      error: c.geradasError ? { message: "down" } : null,
    })),
  }
  const deleteFiltroSpy = vi.fn()
  const cadeiaDelete = {
    eq: vi.fn((col: string, val: unknown) => {
      deleteFiltroSpy("eq", col, val)
      return cadeiaDelete
    }),
    select: vi.fn(async () => ({
      data: c.deleteError ? null : (c.deleteLinhas ?? []),
      error: c.deleteError ? { message: "down" } : null,
    })),
  }
  const deleteSpy = vi.fn(() => cadeiaDelete)
  let tentativaUpsert = 0
  const upsertSpy = vi.fn(async (_payload: unknown, _opts?: unknown) => {
    void _payload
    void _opts
    const codigo = c.upsertErros?.[tentativaUpsert] ?? null
    tentativaUpsert++
    return { error: codigo ? { message: "erro", code: codigo } : null }
  })
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user ?? null },
        error: c.authError ? { message: "jwt expired" } : null,
      })),
    },
    rpc: rpcSpy,
    from: vi.fn((tabela: string) => {
      if (tabela === "tournaments") return { select: tournamentsSelect }
      if (tabela === "matches") return { select: vi.fn(() => cadeiaMatches) }
      return { delete: deleteSpy, upsert: upsertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    rpcSpy,
    filtroSpy,
    deleteSpy,
    deleteFiltroSpy,
    upsertSpy,
    fromSpy: client.from,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("aceitarConvite", () => {
  it("código com formato inválido não toca o banco", async () => {
    const r = await aceitarConvite({}, formData({ codigo: "###" }))
    expect(r.error).toMatch(/convite inválido/i)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem chamar a RPC", async () => {
    const { rpcSpy } = montarClient({ user: null })
    const r = await aceitarConvite({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/sess/i)
    expect(rpcSpy).not.toHaveBeenCalled()
  })

  it("aceite com sucesso revalida e redireciona à página do torneio", async () => {
    const { rpcSpy } = montarClient({ user: { id: ALVO }, rpcData: TORNEIO })
    await expect(
      aceitarConvite({}, formData({ codigo: CODIGO }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(rpcSpy).toHaveBeenCalledWith("aceitar_convite", { codigo: CODIGO })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("mensagens NOSSAS do banco são repassadas (convite inválido)", async () => {
    montarClient({ user: { id: ALVO }, rpcError: "Convite inválido ou expirado" })
    const r = await aceitarConvite({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/convite inválido ou expirado/i)
  })

  it("mensagens NOSSAS do banco são repassadas (torneio encerrado)", async () => {
    montarClient({
      user: { id: ALVO },
      rpcError: "Este torneio está encerrado e não aceita novos participantes",
    })
    const r = await aceitarConvite({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/encerrado/i)
  })

  it("erro desconhecido do banco vira mensagem genérica (não vaza detalhe)", async () => {
    montarClient({
      user: { id: ALVO },
      rpcError: 'permission denied for table "participants"',
    })
    const r = await aceitarConvite({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/não foi possível aceitar/i)
    expect(r.error).not.toMatch(/permission/i)
  })

  it("exceção na RPC é tratada (não vira 500)", async () => {
    montarClient({ user: { id: ALVO }, rpcThrows: true })
    const r = await aceitarConvite({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/não foi possível aceitar/i)
  })
})

describe("sairDoTorneio", () => {
  it("id inválido não toca o banco", async () => {
    const r = await sairDoTorneio("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem deletar", async () => {
    const { deleteSpy } = montarClient({ user: null })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("sai filtrando pelo PRÓPRIO user.id e revalida", async () => {
    const { deleteFiltroSpy } = montarClient({
      user: { id: ALVO },
      deleteLinhas: [{ user_id: ALVO }],
    })
    const r = await sairDoTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "user_id", ALVO)
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("0 linhas afetadas = não participava", async () => {
    montarClient({ user: { id: ALVO }, deleteLinhas: [] })
    const r = await sairDoTorneio(TORNEIO)
    expect(r).toEqual({ ok: false, error: "Você não participa deste torneio." })
  })

  it("erro do banco vira mensagem genérica", async () => {
    montarClient({ user: { id: ALVO }, deleteError: true })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
  })

  it("mata-mata ATIVO congela a saída (chave depende de todos), sem deletar", async () => {
    // O gate busca o torneio por formato=mata_mata e decide pelo status:
    // ativo = chave em andamento → sair travaria o avanço de fase.
    const { deleteSpy, filtroSpy } = montarClient({
      user: { id: ALVO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "ativo" },
    })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disputa.*já foi gerada/i)
    expect(deleteSpy).not.toHaveBeenCalled()
    // O gate filtra pelos formatos COM CHAVE (mata-mata, grupos, fase de liga).
    expect(filtroSpy).toHaveBeenCalledWith("in", "formato", [
      "mata_mata",
      "grupos_mata_mata",
      "fase_liga",
    ])
  })

  it("mata-mata ENCERRADO com chave gerada também congela (encerrado é reabrível)", async () => {
    // Sem este gate, encerrar → sair → reabrir recriaria o travamento
    // permanente do avanço de fase que o congelamento de 'ativo' fechou.
    const { deleteSpy } = montarClient({
      user: { id: ALVO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "encerrado" },
      jaGeradas: true,
    })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disputa.*já foi gerada/i)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("mata-mata encerrado SEM chave (cancelado no rascunho) segue livre", async () => {
    const { deleteSpy } = montarClient({
      user: { id: ALVO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "encerrado" },
      jaGeradas: false,
      deleteLinhas: [{ user_id: ALVO }],
    })
    const r = await sairDoTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(deleteSpy).toHaveBeenCalled()
  })

  it("erro na detecção de chave gerada vira mensagem genérica, sem deletar", async () => {
    const { deleteSpy } = montarClient({
      user: { id: ALVO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "encerrado" },
      geradasError: true,
    })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("erro no lookup do gate vira mensagem genérica, sem deletar", async () => {
    const { deleteSpy } = montarClient({ user: { id: ALVO }, torneioError: true })
    const r = await sairDoTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível/i)
    expect(deleteSpy).not.toHaveBeenCalled()
  })
})

describe("removerParticipante", () => {
  it("entrada inválida não toca o banco", async () => {
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: "x" })
    expect(r).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("não-dono recebe mensagem única, sem deletar", async () => {
    const { deleteSpy, filtroSpy } = montarClient({
      user: { id: ALVO },
      torneio: null,
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: DONO })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrado|dono/i)
    expect(deleteSpy).not.toHaveBeenCalled()
    // Propriedade conferida por FILTRO no servidor.
    expect(filtroSpy).toHaveBeenCalledWith("eq", "id", TORNEIO)
    expect(filtroSpy).toHaveBeenCalledWith("eq", "created_by", ALVO)
  })

  it("dono remove participante (delete filtrado) e revalida", async () => {
    const { deleteFiltroSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      deleteLinhas: [{ user_id: ALVO }],
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: ALVO })
    expect(r).toEqual({ ok: true })
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
    expect(deleteFiltroSpy).toHaveBeenCalledWith("eq", "user_id", ALVO)
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("0 linhas afetadas = usuário não participava", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      deleteLinhas: [],
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: ALVO })
    expect(r).toEqual({
      ok: false,
      error: "Este usuário não participa do torneio.",
    })
  })

  it("mata-mata ATIVO congela a remoção (mesmo sendo o dono), sem deletar", async () => {
    const { deleteSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "ativo" },
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: ALVO })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disputa.*já foi gerada/i)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("mata-mata ENCERRADO com chave gerada congela a remoção", async () => {
    const { deleteSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "encerrado" },
      jaGeradas: true,
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: ALVO })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/disputa.*já foi gerada/i)
    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it("mata-mata em RASCUNHO segue removível (chave ainda não gerada)", async () => {
    montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO, formato: "mata_mata", status: "rascunho" },
      deleteLinhas: [{ user_id: ALVO }],
    })
    const r = await removerParticipante({ tournamentId: TORNEIO, userId: ALVO })
    expect(r).toEqual({ ok: true })
  })
})

describe("participarDoProprioTorneio", () => {
  it("não-dono/encerrado/inexistente: mensagem única sem upsert", async () => {
    const { upsertSpy, filtroSpy } = montarClient({
      user: { id: ALVO },
      torneio: null,
    })
    const r = await participarDoProprioTorneio(TORNEIO)
    expect(r.ok).toBe(false)
    expect(upsertSpy).not.toHaveBeenCalled()
    // Propriedade E lifecycle por filtro (torneio encerrado não recebe ninguém).
    expect(filtroSpy).toHaveBeenCalledWith("eq", "created_by", ALVO)
    expect(filtroSpy).toHaveBeenCalledWith("neq", "status", "encerrado")
  })

  it("dono entra de forma idempotente (upsert ignoreDuplicates)", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      upsertErros: [null],
    })
    const r = await participarDoProprioTorneio(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledWith(
      { tournament_id: TORNEIO, user_id: DONO },
      { onConflict: "tournament_id,user_id", ignoreDuplicates: true }
    )
  })
})

describe("regenerarConvite", () => {
  it("não-dono recebe mensagem única, sem upsert", async () => {
    const { upsertSpy } = montarClient({ user: { id: ALVO }, torneio: null })
    const r = await regenerarConvite(TORNEIO)
    expect(r.ok).toBe(false)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("dono regenera: upsert na MESMA linha (onConflict tournament_id)", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      upsertErros: [null],
    })
    const r = await regenerarConvite(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsertSpy.mock.calls[0] as unknown as [
      { tournament_id: string; code: string },
      { onConflict: string },
    ]
    expect(payload.tournament_id).toBe(TORNEIO)
    expect(payload.code).toMatch(/^[0-9a-z]{16}$/)
    expect(opts.onConflict).toBe("tournament_id")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("colisão de código (23505) ganha UM retry com código novo", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      upsertErros: ["23505", null],
    })
    const r = await regenerarConvite(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledTimes(2)
    const c1 = (upsertSpy.mock.calls[0][0] as unknown as { code: string }).code
    const c2 = (upsertSpy.mock.calls[1][0] as unknown as { code: string }).code
    expect(c1).not.toBe(c2)
  })

  it("erro que não é colisão falha sem retry", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      upsertErros: ["42501"],
    })
    const r = await regenerarConvite(TORNEIO)
    expect(r.ok).toBe(false)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("colisão dupla desiste com mensagem genérica", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      torneio: { id: TORNEIO },
      upsertErros: ["23505", "23505"],
    })
    const r = await regenerarConvite(TORNEIO)
    expect(r.ok).toBe(false)
    expect(upsertSpy).toHaveBeenCalledTimes(2)
  })
})
