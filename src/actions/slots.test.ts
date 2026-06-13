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
  aceitarConviteVaga,
  assumirVagaComoDono,
  desistirDaVaga,
  expulsarTecnico,
  regenerarConviteVaga,
} from "@/actions/slots"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockRevalidate = vi.mocked(revalidatePath)

const TORNEIO = "11111111-1111-4111-8111-111111111111"
const SLOT = "44444444-4444-4444-8444-444444444444"
const DONO = "22222222-2222-4222-8222-222222222222"
const TECNICO = "33333333-3333-4333-8333-333333333333"
const TEAM = "55555555-5555-4555-8555-555555555555"
const CODIGO = "abc123def456ghj7"

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  /** Retorno do RPC aceitar_convite_vaga (uuid do torneio). */
  rpcData?: string | null
  /** Erro do RPC: { message } com código curto, e/ou code (23505). */
  rpcError?: { message?: string; code?: string } | null
  rpcThrows?: boolean
  /** Lookup do slot (propriedade por filtro: slot do MEU torneio). team_id
   * null = vaga por NOME (regenerarConviteVaga recusa). */
  slot?: { id: string; tournament_id: string; team_id?: string | null } | null
  slotError?: boolean
  /** Linhas afetadas pelo UPDATE de esvaziar (select de confirmação). */
  updateLinhas?: Array<{ id: string }>
  updateError?: boolean
  /** Convite lido em slot_invites (assumirVagaComoDono / regenerar). */
  convite?: { code: string } | null
  conviteError?: boolean
  /** Códigos de erro dos upserts sucessivos de slot_invites (null = sucesso). */
  upsertErros?: (string | null)[]
}

function montarClient(c: Cenario) {
  const rpcSpy = vi.fn(async () => {
    if (c.rpcThrows) throw new Error("conexão caiu")
    return {
      data: c.rpcError ? null : (c.rpcData ?? null),
      error: c.rpcError ?? null,
    }
  })

  // Lookup de slot com embed de tournaments (propriedade por filtro).
  const slotFiltroSpy = vi.fn()
  const slotSelect = vi.fn(() => {
    const cadeia = {
      eq: vi.fn((col: string, val: unknown) => {
        slotFiltroSpy("eq", col, val)
        return cadeia
      }),
      maybeSingle: vi.fn(async () => ({
        data: c.slot ?? null,
        error: c.slotError ? { message: "down" } : null,
      })),
    }
    return cadeia
  })

  // UPDATE ... eq ... select() de tournament_slots (esvaziar a vaga).
  const updateFiltroSpy = vi.fn()
  const cadeiaUpdate = {
    eq: vi.fn((col: string, val: unknown) => {
      updateFiltroSpy("eq", col, val)
      return cadeiaUpdate
    }),
    select: vi.fn(async () => ({
      data: c.updateError ? null : (c.updateLinhas ?? []),
      error: c.updateError ? { message: "down" } : null,
    })),
  }
  const updateSpy = vi.fn(() => cadeiaUpdate)

  // Leitura do code em slot_invites (assumirVagaComoDono).
  const conviteFiltroSpy = vi.fn()
  const conviteSelect = vi.fn(() => {
    const cadeia = {
      eq: vi.fn((col: string, val: unknown) => {
        conviteFiltroSpy("eq", col, val)
        return cadeia
      }),
      maybeSingle: vi.fn(async () => ({
        data: c.convite ?? null,
        error: c.conviteError ? { message: "down" } : null,
      })),
    }
    return cadeia
  })

  // Upsert de slot_invites (regenerar convite da vaga).
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
      if (tabela === "tournament_slots") {
        return { select: slotSelect, update: updateSpy }
      }
      // slot_invites
      return { select: conviteSelect, upsert: upsertSpy }
    }),
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return {
    rpcSpy,
    slotFiltroSpy,
    updateSpy,
    updateFiltroSpy,
    conviteSelect,
    conviteFiltroSpy,
    upsertSpy,
    fromSpy: client.from,
  }
}

beforeEach(() => vi.clearAllMocks())

describe("aceitarConviteVaga", () => {
  it("código com formato inválido não toca o banco", async () => {
    const r = await aceitarConviteVaga({}, formData({ codigo: "###" }))
    expect(r.error).toMatch(/convite inválido/i)
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("aceite com sucesso revalida e redireciona à página do torneio", async () => {
    const { rpcSpy } = montarClient({ user: { id: TECNICO }, rpcData: TORNEIO })
    await expect(
      aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    ).rejects.toThrow(`NEXT_REDIRECT:/dashboard/torneios/${TORNEIO}`)
    expect(rpcSpy).toHaveBeenCalledWith("aceitar_convite_vaga", { codigo: CODIGO })
    expect(mockRevalidate).toHaveBeenCalledWith("/dashboard")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("CONVITE_INVALIDO vira mensagem pt-BR precisa", async () => {
    montarClient({ user: { id: TECNICO }, rpcError: { message: "CONVITE_INVALIDO" } })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/convite inválido ou expirado/i)
  })

  it("TORNEIO_ENCERRADO vira mensagem pt-BR precisa", async () => {
    montarClient({ user: { id: TECNICO }, rpcError: { message: "TORNEIO_ENCERRADO" } })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/encerrado/i)
  })

  it("VAGA_OCUPADA orienta a pedir outro convite", async () => {
    montarClient({ user: { id: TECNICO }, rpcError: { message: "VAGA_OCUPADA" } })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/acabou de ganhar um técnico.*outro convite/i)
  })

  it("AUTH_REQUIRED vira mensagem de autenticação", async () => {
    montarClient({ user: { id: TECNICO }, rpcError: { message: "AUTH_REQUIRED" } })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/autenticado/i)
  })

  it("23505 (já comanda outro clube) vira mensagem precisa", async () => {
    montarClient({
      user: { id: TECNICO },
      rpcError: { message: "duplicate key", code: "23505" },
    })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/já comanda um clube neste torneio/i)
  })

  it("erro desconhecido vira mensagem genérica (não vaza detalhe)", async () => {
    montarClient({
      user: { id: TECNICO },
      rpcError: { message: 'permission denied for table "tournament_slots"' },
    })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/não foi possível assumir a vaga/i)
    expect(r.error).not.toMatch(/permission/i)
  })

  it("exceção na RPC é tratada (não vira 500)", async () => {
    montarClient({ user: { id: TECNICO }, rpcThrows: true })
    const r = await aceitarConviteVaga({}, formData({ codigo: CODIGO }))
    expect(r.error).toMatch(/não foi possível assumir a vaga/i)
  })
})

describe("desistirDaVaga", () => {
  it("id inválido não toca o banco", async () => {
    const r = await desistirDaVaga("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Torneio inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem atualizar", async () => {
    const { updateSpy } = montarClient({ user: null })
    const r = await desistirDaVaga(TORNEIO)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("desiste filtrando torneio + PRÓPRIO user.id e revalida", async () => {
    const { updateFiltroSpy } = montarClient({
      user: { id: TECNICO },
      updateLinhas: [{ id: SLOT }],
    })
    const r = await desistirDaVaga(TORNEIO)
    expect(r).toEqual({ ok: true })
    expect(updateFiltroSpy).toHaveBeenCalledWith("eq", "tournament_id", TORNEIO)
    expect(updateFiltroSpy).toHaveBeenCalledWith("eq", "user_id", TECNICO)
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("0 linhas (não comanda clube, ou RLS de encerrado) → mensagem honesta", async () => {
    montarClient({ user: { id: TECNICO }, updateLinhas: [] })
    const r = await desistirDaVaga(TORNEIO)
    expect(r).toEqual({
      ok: false,
      error: "Você não comanda nenhum clube neste torneio.",
    })
  })

  it("erro do banco vira mensagem genérica", async () => {
    montarClient({ user: { id: TECNICO }, updateError: true })
    const r = await desistirDaVaga(TORNEIO)
    expect(r.ok).toBe(false)
  })
})

describe("expulsarTecnico", () => {
  it("id inválido não toca o banco", async () => {
    const r = await expulsarTecnico("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Vaga inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem atualizar", async () => {
    const { updateSpy } = montarClient({ user: null })
    const r = await expulsarTecnico(SLOT)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("não-dono recebe a MESMA resposta única, sem atualizar", async () => {
    // Propriedade por FILTRO: slot de torneio alheio/inexistente → lookup 0
    // linhas → mensagem única, sem oráculo.
    const { updateSpy, slotFiltroSpy } = montarClient({
      user: { id: TECNICO },
      slot: null,
    })
    const r = await expulsarTecnico(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrada|dono/i)
    expect(updateSpy).not.toHaveBeenCalled()
    // Confere por filtro: id da vaga + dono do torneio embedado.
    expect(slotFiltroSpy).toHaveBeenCalledWith("eq", "id", SLOT)
    expect(slotFiltroSpy).toHaveBeenCalledWith("eq", "tournaments.created_by", TECNICO)
  })

  it("dono expulsa: UPDATE esvazia a vaga (filtro por id) e revalida", async () => {
    const { updateFiltroSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO },
      updateLinhas: [{ id: SLOT }],
    })
    const r = await expulsarTecnico(SLOT)
    expect(r).toEqual({ ok: true })
    expect(updateFiltroSpy).toHaveBeenCalledWith("eq", "id", SLOT)
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("0 linhas no update (corrida/RLS após checar dono) → mensagem genérica", async () => {
    montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO },
      updateLinhas: [],
    })
    const r = await expulsarTecnico(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível expulsar/i)
  })

  it("erro no lookup do dono vira mensagem genérica, sem atualizar", async () => {
    const { updateSpy } = montarClient({ user: { id: DONO }, slotError: true })
    const r = await expulsarTecnico(SLOT)
    expect(r.ok).toBe(false)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe("regenerarConviteVaga", () => {
  it("não-dono recebe mensagem única, sem upsert", async () => {
    const { upsertSpy } = montarClient({ user: { id: TECNICO }, slot: null })
    const r = await regenerarConviteVaga(SLOT)
    expect(r.ok).toBe(false)
    expect(upsertSpy).not.toHaveBeenCalled()
  })

  it("dono regenera: upsert na MESMA linha (onConflict slot_id)", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO, team_id: TEAM },
      upsertErros: [null],
    })
    const r = await regenerarConviteVaga(SLOT)
    expect(r).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledTimes(1)
    const [payload, opts] = upsertSpy.mock.calls[0] as unknown as [
      { slot_id: string; code: string },
      { onConflict: string },
    ]
    expect(payload.slot_id).toBe(SLOT)
    expect(payload.code).toMatch(/^[0-9a-z]{16}$/)
    expect(opts.onConflict).toBe("slot_id")
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("colisão de código (23505) ganha UM retry com código novo", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO, team_id: TEAM },
      upsertErros: ["23505", null],
    })
    const r = await regenerarConviteVaga(SLOT)
    expect(r).toEqual({ ok: true })
    expect(upsertSpy).toHaveBeenCalledTimes(2)
    const c1 = (upsertSpy.mock.calls[0][0] as unknown as { code: string }).code
    const c2 = (upsertSpy.mock.calls[1][0] as unknown as { code: string }).code
    expect(c1).not.toBe(c2)
  })

  it("erro que não é colisão falha sem retry", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO, team_id: TEAM },
      upsertErros: ["42501"],
    })
    const r = await regenerarConviteVaga(SLOT)
    expect(r.ok).toBe(false)
    expect(upsertSpy).toHaveBeenCalledTimes(1)
  })

  it("colisão dupla desiste com mensagem genérica", async () => {
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO, team_id: TEAM },
      upsertErros: ["23505", "23505"],
    })
    const r = await regenerarConviteVaga(SLOT)
    expect(r.ok).toBe(false)
    expect(upsertSpy).toHaveBeenCalledTimes(2)
  })

  it("vaga por NOME (sem clube) é recusada com mensagem clara, sem upsert", async () => {
    // team_id null = vaga por nome: não tem técnico nem convite (o organizador
    // lança os placares). O guard recusa ANTES de tocar slot_invites; a trava
    // real (trigger + RLS) é o backstop no banco.
    const { upsertSpy } = montarClient({
      user: { id: DONO },
      slot: { id: SLOT, tournament_id: TORNEIO, team_id: null },
    })
    const r = await regenerarConviteVaga(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/por nome.*não usam convite/i)
    expect(upsertSpy).not.toHaveBeenCalled()
  })
})

describe("assumirVagaComoDono", () => {
  it("id inválido não toca o banco", async () => {
    const r = await assumirVagaComoDono("nao-uuid")
    expect(r).toEqual({ ok: false, error: "Vaga inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("não-dono (RLS de slot_invites esconde o code) → mensagem única, sem RPC", async () => {
    const { rpcSpy, conviteFiltroSpy } = montarClient({
      user: { id: TECNICO },
      convite: null,
    })
    const r = await assumirVagaComoDono(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrada|convite|dono/i)
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(conviteFiltroSpy).toHaveBeenCalledWith("eq", "slot_id", SLOT)
  })

  it("dono assume via o MESMO RPC aceitar_convite_vaga (caminho único)", async () => {
    const { rpcSpy } = montarClient({
      user: { id: DONO },
      convite: { code: CODIGO },
      rpcData: TORNEIO,
    })
    const r = await assumirVagaComoDono(SLOT)
    expect(r).toEqual({ ok: true })
    // Atribuição de técnico tem caminho ÚNICO: o RPC (nunca UPDATE direto).
    expect(rpcSpy).toHaveBeenCalledWith("aceitar_convite_vaga", { codigo: CODIGO })
    expect(mockRevalidate).toHaveBeenCalledWith(`/dashboard/torneios/${TORNEIO}`)
  })

  it("VAGA_OCUPADA do RPC (alguém assumiu antes) vira mensagem precisa", async () => {
    montarClient({
      user: { id: DONO },
      convite: { code: CODIGO },
      rpcError: { message: "VAGA_OCUPADA" },
    })
    const r = await assumirVagaComoDono(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/acabou de ganhar um técnico/i)
  })

  it("23505 do RPC (dono já comanda outro clube) vira mensagem precisa", async () => {
    montarClient({
      user: { id: DONO },
      convite: { code: CODIGO },
      rpcError: { message: "duplicate key", code: "23505" },
    })
    const r = await assumirVagaComoDono(SLOT)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já comanda um clube/i)
  })

  it("erro ao ler o convite vira mensagem genérica, sem RPC", async () => {
    const { rpcSpy } = montarClient({ user: { id: DONO }, conviteError: true })
    const r = await assumirVagaComoDono(SLOT)
    expect(r.ok).toBe(false)
    expect(rpcSpy).not.toHaveBeenCalled()
  })
})
