import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/autorizacao", () => ({ podeGerir: vi.fn() }))
// Storage isolado: `escudoCustom.test.ts` cobre a validação de bytes; aqui o foco
// é autorização, ordem das operações e limpeza de arquivo órfão.
vi.mock("@/lib/escudoCustom", () => ({
  subirEscudoCustom: vi.fn(),
  removerEscudoCustom: vi.fn(),
}))

import {
  definirEscudoCompetidor,
  removerEscudoCompetidor,
} from "@/actions/escudoCompetidor"
import { podeGerir } from "@/lib/autorizacao"
import { removerEscudoCustom, subirEscudoCustom } from "@/lib/escudoCustom"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockPodeGerir = vi.mocked(podeGerir)
const mockSubir = vi.mocked(subirEscudoCustom)
const mockRemover = vi.mocked(removerEscudoCustom)

const COMPETITOR = "11111111-1111-4111-8111-111111111111"
const SEASON = "22222222-2222-4222-8222-222222222222"
const COMPETITION = "33333333-3333-4333-8333-333333333333"
const URL_NOVA =
  "https://exemplo.supabase.co/storage/v1/object/public/escudos/custom/x/nova.png"
const URL_ANTIGA =
  "https://exemplo.supabase.co/storage/v1/object/public/escudos/custom/x/antiga.png"

const SEM_ACESSO = "Competidor não encontrado ou você não tem acesso a esta ação."

/**
 * Cliente Supabase mínimo: `select().eq().maybeSingle()` para a leitura do
 * competidor e `update().eq().select()` para a escrita.
 */
function mockCliente({
  user = { id: "u1" },
  competidor = { competition_id: COMPETITION, escudo_url: URL_ANTIGA },
  leituraErro = null as { code?: string; message: string } | null,
  atualizados = [{ id: COMPETITOR }] as { id: string }[] | null,
  updateErro = null as { code?: string; message: string } | null,
} = {}) {
  const update = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: atualizados, error: updateErro }),
    }),
  })
  const from = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi
          .fn()
          .mockResolvedValue({ data: leituraErro ? null : competidor, error: leituraErro }),
      }),
    }),
    update,
  })
  mockCreateClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from,
  } as unknown as never)
  return { update }
}

function formData(file: unknown = new File([], "e.png"), seasonId = SEASON) {
  const fd = new FormData()
  if (file !== null) fd.append("escudo", file as Blob)
  fd.append("seasonId", seasonId)
  return fd
}

beforeEach(() => {
  vi.clearAllMocks()
  mockPodeGerir.mockResolvedValue(true)
  mockSubir.mockResolvedValue({ ok: true, url: URL_NOVA })
  mockRemover.mockResolvedValue(undefined)
})

describe("definirEscudoCompetidor", () => {
  it("grava o override e apaga o arquivo ANTERIOR (só após o UPDATE confirmado)", async () => {
    const { update } = mockCliente()
    const r = await definirEscudoCompetidor(COMPETITOR, formData())

    expect(r).toEqual({ ok: true, escudoUrl: URL_NOVA })
    // O catálogo global (public.teams) nunca é tocado.
    expect(update).toHaveBeenCalledWith({ escudo_url: URL_NOVA })
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), URL_ANTIGA)
  })

  it("recusa competidor com id inválido antes de qualquer ida ao banco", async () => {
    const r = await definirEscudoCompetidor("nao-e-uuid", formData())
    expect(r).toEqual({ ok: false, error: "Competidor inválido." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("recusa sem sessão", async () => {
    mockCliente({ user: null as unknown as { id: string } })
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({ ok: false, error: "Você precisa estar autenticado." })
    expect(mockSubir).not.toHaveBeenCalled()
  })

  it("recusa quem não tem capacidade GERIR, sem subir nada", async () => {
    mockCliente()
    mockPodeGerir.mockResolvedValue(false)
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({ ok: false, error: SEM_ACESSO })
    expect(mockSubir).not.toHaveBeenCalled()
  })

  it("competidor inexistente responde igual a sem acesso (sem oráculo)", async () => {
    mockCliente({ competidor: null as unknown as { competition_id: string; escudo_url: string } })
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({ ok: false, error: SEM_ACESSO })
  })

  it("RLS barrando (0 linhas) devolve sem acesso E limpa o arquivo órfão", async () => {
    mockCliente({ atualizados: [] })
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({ ok: false, error: SEM_ACESSO })
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), URL_NOVA)
    // O anterior NÃO pode ser apagado: o override antigo continua valendo.
    expect(mockRemover).not.toHaveBeenCalledWith(expect.anything(), URL_ANTIGA)
  })

  it("erro no UPDATE limpa o arquivo órfão e não vaza detalhe", async () => {
    mockCliente({ updateErro: { code: "42501", message: "denied" } })
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível salvar o escudo agora. Tente novamente.",
    })
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), URL_NOVA)
  })

  it("propaga a recusa do upload sem tocar o banco", async () => {
    const { update } = mockCliente()
    mockSubir.mockResolvedValue({ ok: false, error: "Use uma imagem PNG ou WEBP." })
    const r = await definirEscudoCompetidor(COMPETITOR, formData())
    expect(r).toEqual({ ok: false, error: "Use uma imagem PNG ou WEBP." })
    expect(update).not.toHaveBeenCalled()
  })

  it("recusa quando não veio arquivo", async () => {
    mockCliente()
    const fd = new FormData()
    fd.append("seasonId", SEASON)
    const r = await definirEscudoCompetidor(COMPETITOR, fd)
    expect(r).toEqual({ ok: false, error: "Selecione uma imagem." })
  })
})

describe("removerEscudoCompetidor", () => {
  it("zera o override e apaga o arquivo", async () => {
    const { update } = mockCliente()
    const r = await removerEscudoCompetidor(COMPETITOR, SEASON)
    expect(r).toEqual({ ok: true, escudoUrl: null })
    expect(update).toHaveBeenCalledWith({ escudo_url: null })
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), URL_ANTIGA)
  })

  it("recusa quem não tem capacidade GERIR", async () => {
    mockCliente()
    mockPodeGerir.mockResolvedValue(false)
    const r = await removerEscudoCompetidor(COMPETITOR, SEASON)
    expect(r).toEqual({ ok: false, error: SEM_ACESSO })
  })

  it("RLS barrando não apaga o arquivo (o override continua valendo)", async () => {
    mockCliente({ atualizados: [] })
    const r = await removerEscudoCompetidor(COMPETITOR, SEASON)
    expect(r).toEqual({ ok: false, error: SEM_ACESSO })
    expect(mockRemover).not.toHaveBeenCalled()
  })
})
