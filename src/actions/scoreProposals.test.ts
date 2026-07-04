import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("@/features/notifications/enviar", () => ({ enviarNotificacoes: vi.fn() }))
// varredura de órfãos tem cobertura própria (closeRound.test.ts); aqui só a orquestração.
vi.mock("@/features/match/closeRound", () => ({
  varrerOrfaosDaRodada: vi.fn(async () => ({ marcadas: 0 })),
}))
// Evidência mockada: spies limpos sobre upload/remoção (cobertura própria do bucket
// em outro lugar); aqui validamos só QUE a action sobe/remove o que deve.
vi.mock("@/lib/evidence", () => ({
  EVIDENCE_BUCKET: "match_evidence",
  subirEvidencia: vi.fn(),
  removerEvidencia: vi.fn(),
}))

import {
  aprovarPropostaPlacar,
  proporPlacar,
  rejeitarPropostaPlacar,
} from "@/actions/scoreProposals"
import { varrerOrfaosDaRodada } from "@/features/match/closeRound"
import { enviarNotificacoes } from "@/features/notifications/enviar"
import { removerEvidencia, subirEvidencia } from "@/lib/evidence"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)
const mockSubir = vi.mocked(subirEvidencia)
const mockRemover = vi.mocked(removerEvidencia)
const mockNotificar = vi.mocked(enviarNotificacoes)
const mockVarrer = vi.mocked(varrerOrfaosDaRodada)

const MATCH = "11111111-1111-4111-8111-111111111111"
const TORNEIO = "22222222-2222-4222-8222-222222222222"
const TECNICO = "33333333-3333-4333-8333-333333333333"
const OUTRO = "44444444-4444-4444-8444-444444444444"
const DONO = "55555555-5555-4555-8555-555555555555"
const PROPOSTA = "66666666-6666-4666-8666-666666666666"
const FOTO_PATH = `${TECNICO}/${MATCH}/abc.png`

/** Arquivo de evidência com bytes reais (size > 0). */
function fotoValida() {
  return new File([new Uint8Array([1, 2, 3, 4])], "f.png", { type: "image/png" })
}

/** FormData de proposta. Sem `foto` se `semFoto`; foto vazia se `fotoVazia`. */
function fdProposta(
  over: { matchId?: unknown; placar_1?: unknown; placar_2?: unknown } = {},
  opcoes: { semFoto?: boolean; fotoVazia?: boolean } = {}
) {
  const fd = new FormData()
  fd.set("matchId", String(over.matchId ?? MATCH))
  fd.set("placar_1", String(over.placar_1 ?? 2))
  fd.set("placar_2", String(over.placar_2 ?? 1))
  if (!opcoes.semFoto) {
    fd.set(
      "foto",
      opcoes.fotoVazia
        ? new File([], "vazia.png", { type: "image/png" })
        : fotoValida()
    )
  }
  return fd
}

const liberadaPassado = new Date(Date.now() - 60_000).toISOString()
const liberadaFuturo = new Date(Date.now() + 60_000).toISOString()

interface Cenario {
  user?: { id: string } | null
  authError?: boolean
  match?: Record<string, unknown> | null
  matchError?: boolean
  /** Proposta pendente anterior do mesmo técnico (reenvio). */
  anterior?: { id: string; foto_path: string | null } | null
  insertError?: boolean
  insertCode?: string
  /** Linha de proposta lida em aprovar/rejeitar (match_id, submetido_por). */
  prop?: { match_id: string; submetido_por: string } | null
  /** Partida lida pós-RPC para revalidar/varrer. */
  matchPos?: Record<string, unknown> | null
  /** Erro retornado pelo RPC (aprovar/rejeitar). */
  rpcError?: { message: string } | null
  torneio?: { created_by: string; titulo: string } | null
}

/** Partida competitiva aberta e liberada, com o TECNICO na vaga_1. */
const partidaLiberada = (over: Record<string, unknown> = {}) => ({
  id: MATCH,
  status: "agendada",
  tournament_id: TORNEIO,
  rodada: 1,
  liberada_em: liberadaPassado,
  vaga_1: "v1",
  vaga_2: "v2",
  v1: { user_id: TECNICO },
  v2: { user_id: OUTRO },
  ...over,
})

function montarClient(cfg: Cenario) {
  const proposalsInsertSpy = vi.fn()
  const proposalsDeleteSpy = vi.fn()
  const rpcSpy = vi.fn()

  const matchesFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({
        // proporPlacar lê a partida completa; aprovar/rejeitar leem a partida-pós.
        data: cfg.match !== undefined ? cfg.match : (cfg.matchPos ?? null),
        error: cfg.matchError ? { message: "down" } : null,
      }))
      return cadeia
    }),
  }

  const proposalsFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({
        // proporPlacar lê a pendente anterior; aprovar/rejeitar leem a proposta.
        data: cfg.prop !== undefined ? cfg.prop : (cfg.anterior ?? null),
        error: null,
      }))
      return cadeia
    }),
    insert: vi.fn(async (v: unknown) => {
      proposalsInsertSpy(v)
      return {
        error: cfg.insertError
          ? { message: "boom", code: cfg.insertCode ?? "23505" }
          : null,
      }
    }),
    delete: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(async (col: string, val: unknown) => {
        proposalsDeleteSpy(col, val)
        return { error: null }
      })
      return cadeia
    }),
  }

  const tournamentsFrom = {
    select: vi.fn(() => {
      const cadeia: Record<string, unknown> = {}
      cadeia.eq = vi.fn(() => cadeia)
      cadeia.maybeSingle = vi.fn(async () => ({ data: cfg.torneio ?? null, error: null }))
      return cadeia
    }),
  }

  const client = {
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcSpy(fn, args)
      return { data: null, error: cfg.rpcError ?? null }
    }),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: cfg.user ?? null },
        error: cfg.authError ? { message: "jwt" } : null,
      })),
    },
    from: vi.fn((t: string) =>
      t === "matches"
        ? matchesFrom
        : t === "match_score_proposals"
          ? proposalsFrom
          : tournamentsFrom
    ),
    proposalsInsertSpy,
    proposalsDeleteSpy,
    rpcSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: upload bem-sucedido (sobrescrito por teste quando necessário).
  mockSubir.mockResolvedValue({ ok: true, path: FOTO_PATH })
  mockRemover.mockResolvedValue(undefined)
})

describe("proporPlacar", () => {
  it("recusa sem foto anexada (não sobe nada)", async () => {
    const c = montarClient({ user: { id: TECNICO }, match: partidaLiberada() })
    const r = await proporPlacar(fdProposta({}, { semFoto: true }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/anexe uma foto/i)
    expect(mockSubir).not.toHaveBeenCalled()
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("recusa foto vazia (size 0) sem subir", async () => {
    const c = montarClient({ user: { id: TECNICO }, match: partidaLiberada() })
    const r = await proporPlacar(fdProposta({}, { fotoVazia: true }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/anexe uma foto/i)
    expect(mockSubir).not.toHaveBeenCalled()
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("recusa placar inválido (zod) com fieldErrors e sem cliente", async () => {
    const r = await proporPlacar(fdProposta({ placar_1: -1 }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("Placar inválido.")
      expect(r.fieldErrors?.placar_1).toBeTruthy()
    }
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("recusa matchId inválido (zod) com fieldErrors", async () => {
    const r = await proporPlacar(fdProposta({ matchId: "lixo" }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe("Placar inválido.")
      expect(r.fieldErrors?.matchId).toBeTruthy()
    }
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão é recusado", async () => {
    const c = montarClient({ user: null })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autenticado/i)
    expect(mockSubir).not.toHaveBeenCalled()
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("quem não joga a partida (técnico de nenhuma vaga) é recusado", async () => {
    const c = montarClient({
      user: { id: "estranho" },
      match: partidaLiberada({ v1: { user_id: TECNICO }, v2: { user_id: OUTRO } }),
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe("Você não joga esta partida.")
    expect(mockSubir).not.toHaveBeenCalled()
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("partida encerrada é recusada antes de subir foto", async () => {
    const c = montarClient({
      user: { id: TECNICO },
      match: partidaLiberada({ status: "encerrada" }),
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/encerrada/i)
    expect(mockSubir).not.toHaveBeenCalled()
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("rodada não liberada (liberada_em null) é recusada", async () => {
    montarClient({
      user: { id: TECNICO },
      match: partidaLiberada({ liberada_em: null }),
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ainda não foi liberada/i)
    expect(mockSubir).not.toHaveBeenCalled()
  })

  it("rodada com liberada_em no futuro é recusada", async () => {
    montarClient({
      user: { id: TECNICO },
      match: partidaLiberada({ liberada_em: liberadaFuturo }),
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ainda não foi liberada/i)
    expect(mockSubir).not.toHaveBeenCalled()
  })

  it("partida não encontrada é recusada", async () => {
    montarClient({ user: { id: TECNICO }, match: null })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrada/i)
    expect(mockSubir).not.toHaveBeenCalled()
  })

  it("sucesso: técnico de vaga libera → sobe foto e insere a proposta", async () => {
    const c = montarClient({
      user: { id: TECNICO },
      match: partidaLiberada(),
      anterior: null,
      torneio: { created_by: DONO, titulo: "Copa" },
    })
    const r = await proporPlacar(fdProposta({ placar_1: 3, placar_2: 0 }))
    expect(r).toEqual({ ok: true })
    expect(mockSubir).toHaveBeenCalledWith(expect.anything(), TECNICO, MATCH, expect.any(File))
    expect(c.proposalsInsertSpy).toHaveBeenCalledWith({
      match_id: MATCH,
      submetido_por: TECNICO,
      placar_1: 3,
      placar_2: 0,
      foto_path: FOTO_PATH,
    })
    expect(mockNotificar).toHaveBeenCalled()
  })

  it("falha do upload aborta antes do insert", async () => {
    mockSubir.mockResolvedValue({ ok: false, error: "Não foi possível enviar a foto. Tente novamente." })
    const c = montarClient({ user: { id: TECNICO }, match: partidaLiberada() })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/enviar a foto/i)
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("path forjado (pasta de outro uid) aborta antes do insert e remove a órfã", async () => {
    // Invariante de defesa em profundidade: se subirEvidencia devolver um path
    // fora de <uid>/<matchId>/ (pasta de OUTRO usuário), a action recusa, remove
    // a foto órfã e nunca insere a linha.
    const pathForjado = `${OUTRO}/${MATCH}/x.png`
    mockSubir.mockResolvedValue({ ok: true, path: pathForjado })
    const c = montarClient({ user: { id: TECNICO }, match: partidaLiberada() })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível agora/i)
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), pathForjado)
    expect(c.proposalsInsertSpy).not.toHaveBeenCalled()
  })

  it("reenvio: apaga a pendente anterior e remove a foto antiga antes de inserir", async () => {
    const fotoAntiga = `${TECNICO}/${MATCH}/antiga.png`
    const c = montarClient({
      user: { id: TECNICO },
      match: partidaLiberada(),
      anterior: { id: PROPOSTA, foto_path: fotoAntiga },
      torneio: { created_by: DONO, titulo: "Copa" },
    })
    const r = await proporPlacar(fdProposta())
    expect(r).toEqual({ ok: true })
    // deletou a anterior por id e removeu a foto antiga.
    expect(c.proposalsDeleteSpy).toHaveBeenCalledWith("id", PROPOSTA)
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), fotoAntiga)
    // depois inseriu a nova (com a foto nova).
    expect(c.proposalsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ foto_path: FOTO_PATH })
    )
  })

  it("rollback: insert falha → remove a foto recém-subida (órfã)", async () => {
    const c = montarClient({
      user: { id: TECNICO },
      match: partidaLiberada(),
      anterior: null,
      insertError: true,
      insertCode: "XXXXX",
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não foi possível agora/i)
    expect(c.proposalsInsertSpy).toHaveBeenCalled()
    // a foto recém-subida (up.path) é removida como órfã.
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), FOTO_PATH)
  })

  it("insert com 23505 vira mensagem de proposta pendente já existente (e remove órfã)", async () => {
    const c = montarClient({
      user: { id: TECNICO },
      match: partidaLiberada(),
      anterior: null,
      insertError: true,
      insertCode: "23505",
    })
    const r = await proporPlacar(fdProposta())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/já tem uma proposta pendente/i)
    expect(c.proposalsInsertSpy).toHaveBeenCalled()
    expect(mockRemover).toHaveBeenCalledWith(expect.anything(), FOTO_PATH)
  })
})

describe("aprovarPropostaPlacar", () => {
  it("id inválido é recusado sem tocar o banco", async () => {
    const r = await aprovarPropostaPlacar("lixo")
    expect(r).toEqual({ ok: false, error: "Proposta inválida." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão é recusado", async () => {
    const c = montarClient({ user: null })
    const r = await aprovarPropostaPlacar(PROPOSTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/autenticado/i)
    expect(c.rpcSpy).not.toHaveBeenCalled()
  })

  it("RPC NAO_AUTORIZADO mapeia para mensagem de capacidade", async () => {
    const c = montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      rpcError: { message: "P0001: NAO_AUTORIZADO" },
    })
    const r = await aprovarPropostaPlacar(PROPOSTA)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não pode aprovar\/rejeitar/i)
    expect(c.rpcSpy).toHaveBeenCalledWith("aprovar_proposta_placar", { p_proposal_id: PROPOSTA })
    expect(mockVarrer).not.toHaveBeenCalled()
  })

  it("sucesso: RPC ok → revalida, varre a rodada e notifica o técnico", async () => {
    const c = montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      matchPos: { tournament_id: TORNEIO, rodada: 1 },
      rpcError: null,
    })
    const r = await aprovarPropostaPlacar(PROPOSTA)
    expect(r).toEqual({ ok: true })
    expect(c.rpcSpy).toHaveBeenCalledWith("aprovar_proposta_placar", { p_proposal_id: PROPOSTA })
    expect(mockVarrer).toHaveBeenCalledWith(expect.anything(), TORNEIO, 1, {
      somenteSeRodadaCompleta: true,
    })
    expect(mockNotificar).toHaveBeenCalled()
  })

  it("sucesso em partida sem rodada (avulsa) não varre", async () => {
    montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      matchPos: { tournament_id: TORNEIO, rodada: null },
      rpcError: null,
    })
    const r = await aprovarPropostaPlacar(PROPOSTA)
    expect(r).toEqual({ ok: true })
    expect(mockVarrer).not.toHaveBeenCalled()
  })
})

describe("rejeitarPropostaPlacar", () => {
  it("entrada inválida (zod) é recusada sem tocar o banco", async () => {
    const r = await rejeitarPropostaPlacar({ proposalId: "lixo" })
    expect(r).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("motivo longo demais é recusado", async () => {
    const r = await rejeitarPropostaPlacar({
      proposalId: PROPOSTA,
      motivo: "x".repeat(281),
    })
    expect(r).toEqual({ ok: false, error: "Dados inválidos." })
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("RPC com erro mapeado é repassado", async () => {
    const c = montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      rpcError: { message: "P0001: PROPOSTA_INVALIDA" },
    })
    const r = await rejeitarPropostaPlacar({ proposalId: PROPOSTA })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/não encontrada|já resolvida/i)
    expect(c.rpcSpy).toHaveBeenCalledWith("rejeitar_proposta_placar", {
      p_proposal_id: PROPOSTA,
      p_motivo: "",
    })
  })

  it("sucesso com motivo: chama o RPC com {p_proposal_id, p_motivo} e notifica", async () => {
    const c = montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      matchPos: { tournament_id: TORNEIO },
      rpcError: null,
    })
    const r = await rejeitarPropostaPlacar({ proposalId: PROPOSTA, motivo: "Foto ilegível" })
    expect(r).toEqual({ ok: true })
    expect(c.rpcSpy).toHaveBeenCalledWith("rejeitar_proposta_placar", {
      p_proposal_id: PROPOSTA,
      p_motivo: "Foto ilegível",
    })
    expect(mockNotificar).toHaveBeenCalled()
  })

  it("sucesso sem motivo: p_motivo vira string vazia", async () => {
    const c = montarClient({
      user: { id: DONO },
      prop: { match_id: MATCH, submetido_por: TECNICO },
      matchPos: { tournament_id: TORNEIO },
      rpcError: null,
    })
    const r = await rejeitarPropostaPlacar({ proposalId: PROPOSTA })
    expect(r).toEqual({ ok: true })
    expect(c.rpcSpy).toHaveBeenCalledWith("rejeitar_proposta_placar", {
      p_proposal_id: PROPOSTA,
      p_motivo: "",
    })
  })
})
