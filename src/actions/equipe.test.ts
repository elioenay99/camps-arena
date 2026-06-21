import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { buscarUsuarios } from "@/actions/equipe"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const CALLER = "22222222-2222-4222-8222-222222222222"
const OUTRO = "33333333-3333-4333-8333-333333333333"

/**
 * Client mínimo: auth.getUser fixo no caller + um builder de `users_public`
 * encadeável (select→ilike→neq→limit) que resolve com `linhas`. Captura o
 * argumento do `.neq` para provar a exclusão do próprio caller.
 */
function montarClient(linhas: { id: string; nome: string | null; avatar: string | null }[]) {
  const neqSpy = vi.fn()
  const builder = {
    select: vi.fn(() => builder),
    ilike: vi.fn(() => builder),
    neq: vi.fn((col: string, val: string) => {
      neqSpy(col, val)
      return builder
    }),
    limit: vi.fn(async () => ({ data: linhas, error: null })),
  }
  const client = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: CALLER } }, error: null })) },
    from: vi.fn(() => builder),
  }
  return { client, neqSpy }
}

describe("buscarUsuarios", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retorna [] com menos de 2 caracteres (sem consultar)", async () => {
    const { client } = montarClient([])
    // Cast: a action recebe `unknown` na assinatura pública.
    mockCreateClient.mockResolvedValue(client as never)

    await expect(buscarUsuarios("a")).resolves.toEqual([])
    await expect(buscarUsuarios("")).resolves.toEqual([])
    await expect(buscarUsuarios("  ")).resolves.toEqual([])
    // Short-circuit ANTES de tocar o banco: from nunca é chamado.
    expect(client.from).not.toHaveBeenCalled()
  })

  it("retorna [] para entrada não-string", async () => {
    const { client } = montarClient([])
    mockCreateClient.mockResolvedValue(client as never)

    await expect(buscarUsuarios(undefined)).resolves.toEqual([])
    await expect(buscarUsuarios(123)).resolves.toEqual([])
    await expect(buscarUsuarios(null)).resolves.toEqual([])
    expect(client.from).not.toHaveBeenCalled()
  })

  it("consulta e exclui o próprio caller com 2+ caracteres", async () => {
    const linhas = [{ id: OUTRO, nome: "Fulano", avatar: null }]
    const { client, neqSpy } = montarClient(linhas)
    mockCreateClient.mockResolvedValue(client as never)

    const resultado = await buscarUsuarios("fu")
    expect(resultado).toEqual(linhas)
    expect(client.from).toHaveBeenCalledWith("users_public")
    // Exclusão do próprio caller via .neq("id", <callerId>).
    expect(neqSpy).toHaveBeenCalledWith("id", CALLER)
  })
})
