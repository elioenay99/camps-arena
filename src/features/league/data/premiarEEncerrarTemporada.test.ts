import { describe, it, expect, vi, beforeEach } from "vitest"

import type { ItemPlanoFluxo } from "@/features/league/flowEngine"

vi.mock("@/features/league/data/resolverPremiosTemporada", () => ({
  resolverPremiosTemporada: vi.fn(async () => []),
}))
vi.mock("@/features/notifications/enviar", () => ({
  enviarNotificacoes: vi.fn(async () => {}),
}))

import { premiarEEncerrarTemporada } from "./premiarEEncerrarTemporada"
import { resolverPremiosTemporada } from "@/features/league/data/resolverPremiosTemporada"
import { enviarNotificacoes } from "@/features/notifications/enviar"

const mockPremios = vi.mocked(resolverPremiosTemporada)
const mockPush = vi.mocked(enviarNotificacoes)

const SEASON = "s1"
const DONO = "u1"

function item(competitorId: string): ItemPlanoFluxo {
  return {
    competitorId,
    nivelOrigem: 1,
    nivelDestino: 1,
    posicaoFinal: 1,
    pontos: 0,
    jogos: 0,
    destino: "permanece",
    resolvidoPor: "classificacao",
  } as unknown as ItemPlanoFluxo
}

/**
 * Supabase fake que REGISTRA a ordem das operações relevantes: `rpc:...` para a
 * premiação, `update:encerrada` para o flip, `select:league_competitors` para o
 * push. Assim os testes travam a sequência premiar → flip → push.
 */
function fakeSupabase(cfg: {
  rpcError?: boolean
  flipError?: boolean
  ordem: string[]
}) {
  return {
    rpc: vi.fn(async (fn: string) => {
      cfg.ordem.push(`rpc:${fn}`)
      return { data: 0, error: cfg.rpcError ? new Error("rpc") : null }
    }),
    from: vi.fn((table: string) => {
      if (table === "league_seasons") {
        return {
          update: () => ({
            eq: () => ({
              eq: async () => {
                cfg.ordem.push("flip:encerrada")
                return { error: cfg.flipError ? new Error("flip") : null }
              },
            }),
          }),
        }
      }
      if (table === "league_competitors") {
        return {
          select: () => ({
            in: async () => {
              cfg.ordem.push("push:destinatarios")
              return { data: [{ holder_user_id: "h1" }], error: null }
            },
          }),
        }
      }
      throw new Error(`tabela inesperada: ${table}`)
    }),
  } as never
}

beforeEach(() => vi.clearAllMocks())

describe("premiarEEncerrarTemporada (ordem premiar → flip → push)", () => {
  it("erro na RPC de premiação ⇒ NÃO faz o flip nem o push, retorna {ok:false}", async () => {
    const ordem: string[] = []
    const supabase = fakeSupabase({ rpcError: true, ordem })

    const res = await premiarEEncerrarTemporada(supabase, SEASON, DONO, [item("c1")])

    expect(res).toEqual({ ok: false, error: expect.any(String) })
    expect(ordem).toEqual(["rpc:registrar_conquistas_temporada"])
    expect(ordem).not.toContain("flip:encerrada")
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("resolverPremios lança ⇒ NÃO faz o flip, retorna {ok:false}", async () => {
    const ordem: string[] = []
    mockPremios.mockRejectedValueOnce(new Error("io"))
    const supabase = fakeSupabase({ ordem })

    const res = await premiarEEncerrarTemporada(supabase, SEASON, DONO, [item("c1")])

    expect(res).toEqual({ ok: false, error: expect.any(String) })
    expect(ordem).toEqual([]) // nem rpc completou, nem flip
  })

  it("sucesso: premiação → flip → push, NESSA ORDEM, retorna {ok:true}", async () => {
    const ordem: string[] = []
    const supabase = fakeSupabase({ ordem })

    const res = await premiarEEncerrarTemporada(supabase, SEASON, DONO, [item("c1")])

    expect(res).toEqual({ ok: true })
    expect(ordem).toEqual([
      "rpc:registrar_conquistas_temporada",
      "flip:encerrada",
      "push:destinatarios",
    ])
    expect(mockPush).toHaveBeenCalledOnce()
  })

  it("flip falha ⇒ retorna {ok:false} e o push NÃO sai (nenhum aviso prematuro)", async () => {
    const ordem: string[] = []
    const supabase = fakeSupabase({ flipError: true, ordem })

    const res = await premiarEEncerrarTemporada(supabase, SEASON, DONO, [item("c1")])

    expect(res).toEqual({ ok: false, error: expect.any(String) })
    expect(ordem).toEqual(["rpc:registrar_conquistas_temporada", "flip:encerrada"])
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("push best-effort: mesmo se `enviarNotificacoes` lançar, o encerramento é {ok:true}", async () => {
    const ordem: string[] = []
    mockPush.mockRejectedValueOnce(new Error("push caiu"))
    const supabase = fakeSupabase({ ordem })

    const res = await premiarEEncerrarTemporada(supabase, SEASON, DONO, [item("c1")])

    expect(res).toEqual({ ok: true })
    expect(ordem).toContain("flip:encerrada")
  })
})
