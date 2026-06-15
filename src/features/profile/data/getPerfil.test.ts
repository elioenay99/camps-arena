import { beforeEach, describe, expect, it, vi } from "vitest"

// `server-only` lança fora de um ambiente RSC; neutraliza no teste.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

import { getPerfil } from "@/features/profile/data/getPerfil"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const EU = "22222222-2222-4222-8222-222222222222"

interface Cenario {
  user?: { id: string } | null
  /** Linha de `users` (id/nome/avatar; SEM celular — a coluna perdeu o grant). */
  perfil?: { id: string; nome: string | null; avatar: string | null } | null
  /** Retorno da RPC `celulares_de_contato` (self resolve o próprio número). */
  contatos?: { user_id: string; celular: string | null }[]
}

function montarClient(c: Cenario) {
  const rpcSpy = vi.fn()
  const selectSpy = vi.fn()
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user === undefined ? { id: EU } : c.user },
        error: null,
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn((cols: unknown) => {
        selectSpy(cols)
        return {
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: c.perfil ?? null, error: null })),
          })),
        }
      }),
    })),
    rpc: vi.fn(async (fn: string, args: unknown) => {
      rpcSpy(fn, args)
      return { data: c.contatos ?? [], error: null }
    }),
    rpcSpy,
    selectSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("getPerfil", () => {
  it("retorna null sem sessão", async () => {
    montarClient({ user: null })
    expect(await getPerfil()).toBeNull()
  })

  it("monta o perfil com o celular vindo da RPC self (não do embed)", async () => {
    const client = montarClient({
      perfil: { id: EU, nome: "Ataias", avatar: "https://x/a.png" },
      contatos: [{ user_id: EU, celular: "11912345678" }],
    })
    const r = await getPerfil()
    expect(r).toEqual({
      id: EU,
      nome: "Ataias",
      celular: "11912345678",
      avatar: "https://x/a.png",
    })
    // O SELECT direto NÃO pede mais a coluna celular (perdeu o grant).
    expect(String(client.selectSpy.mock.calls[0][0])).not.toContain("celular")
    // A RPC foi consultada com o PRÓPRIO id (branch self).
    expect(client.rpcSpy).toHaveBeenCalledWith(
      "celulares_de_contato",
      expect.objectContaining({ p_user_ids: [EU] })
    )
  })

  it("sem linha em users, devolve perfil vazio com o id da sessão", async () => {
    montarClient({ perfil: null, contatos: [] })
    expect(await getPerfil()).toEqual({
      id: EU,
      nome: null,
      celular: null,
      avatar: null,
    })
  })

  it("RPC sem retorno → celular null (chave presente, não undefined)", async () => {
    const r = await (async () => {
      montarClient({ perfil: { id: EU, nome: "Ataias", avatar: null }, contatos: [] })
      return getPerfil()
    })()
    expect(r?.celular).toBeNull()
    expect(r).toHaveProperty("celular")
  })
})
