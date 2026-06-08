import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import {
  atualizarAvatar,
  atualizarPerfil,
  removerAvatar,
} from "@/actions/profile"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

const USER = "11111111-1111-4111-8111-111111111111"

interface Cenario {
  user?: { id: string } | null
  updateError?: boolean
  uploadError?: boolean
  /** avatar atual em public.users (para apagar o antigo). */
  avatarAtual?: string | null
}

function montarClient(c: Cenario = {}) {
  const updatePayloadSpy = vi.fn()
  const updateFiltroSpy = vi.fn()
  const uploadSpy = vi.fn()
  const removeSpy = vi.fn()

  const usersBuilder = {
    update: vi.fn((payload: unknown) => {
      updatePayloadSpy(payload)
      return {
        eq: vi.fn((col: string, val: unknown) => {
          updateFiltroSpy(col, val)
          return Promise.resolve({
            error: c.updateError ? { message: "rls", code: "42501" } : null,
          })
        }),
      }
    }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { avatar: c.avatarAtual ?? null },
          error: null,
        })),
      })),
    })),
  }

  const storageBucket = {
    upload: vi.fn(async (path: string, file: unknown, opts: unknown) => {
      uploadSpy(path, file, opts)
      return { error: c.uploadError ? { message: "boom" } : null }
    }),
    getPublicUrl: vi.fn((path: string) => ({
      data: {
        publicUrl: `https://proj.supabase.co/storage/v1/object/public/avatars/${path}`,
      },
    })),
    remove: vi.fn(async (paths: string[]) => {
      removeSpy(paths)
      return { error: null }
    }),
  }

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: c.user === undefined ? { id: USER } : c.user },
        error: null,
      })),
    },
    from: vi.fn(() => usersBuilder),
    storage: { from: vi.fn(() => storageBucket) },
    updatePayloadSpy,
    updateFiltroSpy,
    uploadSpy,
    removeSpy,
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return client
}

function formData(campos: Record<string, string | File>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

function imagem(tipo = "image/png", bytes = 10) {
  return new File(["x".repeat(bytes)], "foto.png", { type: tipo })
}

beforeEach(() => vi.clearAllMocks())

describe("atualizarPerfil", () => {
  it("celular inválido é rejeitado sem gravar", async () => {
    const c = montarClient()
    const r = await atualizarPerfil({}, formData({ nome: "Ana", celular: "123" }))
    expect(r.error).toMatch(/campos destacados/i)
    expect(r.fieldErrors?.celular).toBeTruthy()
    expect(c.updatePayloadSpy).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita sem gravar", async () => {
    const c = montarClient({ user: null })
    const r = await atualizarPerfil(
      {},
      formData({ nome: "Ana", celular: "(11) 91234-5678" })
    )
    expect(r.error).toMatch(/sess[aã]o/i)
    expect(c.updatePayloadSpy).not.toHaveBeenCalled()
  })

  it("sucesso: grava nome/celular SÓ na linha do próprio usuário", async () => {
    const c = montarClient()
    const r = await atualizarPerfil(
      {},
      formData({ nome: "Ana Souza", celular: "(11) 91234-5678" })
    )
    expect(r).toEqual({ success: "Perfil atualizado." })
    expect(c.updatePayloadSpy).toHaveBeenCalledWith({
      nome: "Ana Souza",
      celular: "11912345678",
    })
    expect(c.updateFiltroSpy).toHaveBeenCalledWith("id", USER)
  })

  it("erro do banco vira mensagem genérica", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    montarClient({ updateError: true })
    const r = await atualizarPerfil(
      {},
      formData({ nome: "Ana", celular: "(11) 91234-5678" })
    )
    expect(r.error).toMatch(/não foi possível/i)
    consoleSpy.mockRestore()
  })
})

describe("atualizarAvatar", () => {
  it("sem arquivo rejeita", async () => {
    montarClient()
    const r = await atualizarAvatar(formData({}))
    expect(r).toEqual({ ok: false, error: "Selecione uma imagem." })
  })

  it("tipo não-imagem é recusado", async () => {
    const c = montarClient()
    const r = await atualizarAvatar(formData({ avatar: imagem("application/pdf") }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/PNG, JPG/i)
    expect(c.uploadSpy).not.toHaveBeenCalled()
  })

  it("acima de 2MB é recusado", async () => {
    const c = montarClient()
    const grande = imagem("image/png", 2 * 1024 * 1024 + 1)
    const r = await atualizarAvatar(formData({ avatar: grande }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/2MB/i)
    expect(c.uploadSpy).not.toHaveBeenCalled()
  })

  it("sucesso: sobe na pasta do dono, grava a URL e apaga a foto antiga", async () => {
    const c = montarClient({ avatarAtual: "https://proj.supabase.co/storage/v1/object/public/avatars/" + USER + "/antiga.png" })
    const r = await atualizarAvatar(formData({ avatar: imagem("image/png") }))
    expect(r.ok).toBe(true)
    // Caminho começa pela pasta do PRÓPRIO usuário (satisfaz a RLS de storage).
    const caminho = c.uploadSpy.mock.calls[0][0] as string
    expect(caminho.startsWith(`${USER}/`)).toBe(true)
    // Grava a URL pública em users.avatar.
    expect(c.updatePayloadSpy).toHaveBeenCalledWith({
      avatar: expect.stringContaining("/avatars/" + USER + "/"),
    })
    // Apaga o arquivo antigo (cleanup).
    expect(c.removeSpy).toHaveBeenCalledWith([`${USER}/antiga.png`])
  })

  it("falha no upload não grava nada", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const c = montarClient({ uploadError: true })
    const r = await atualizarAvatar(formData({ avatar: imagem() }))
    expect(r.ok).toBe(false)
    expect(c.updatePayloadSpy).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})

describe("removerAvatar", () => {
  it("zera a coluna e apaga o arquivo atual", async () => {
    const c = montarClient({
      avatarAtual: `https://proj.supabase.co/storage/v1/object/public/avatars/${USER}/atual.png`,
    })
    const r = await removerAvatar()
    expect(r).toEqual({ ok: true, url: null })
    expect(c.updatePayloadSpy).toHaveBeenCalledWith({ avatar: null })
    expect(c.removeSpy).toHaveBeenCalledWith([`${USER}/atual.png`])
  })

  it("sem sessão rejeita", async () => {
    const c = montarClient({ user: null })
    const r = await removerAvatar()
    expect(r.ok).toBe(false)
    expect(c.updatePayloadSpy).not.toHaveBeenCalled()
  })
})
