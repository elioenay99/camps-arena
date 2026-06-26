import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({
  // O redirect real lança NEXT_REDIRECT; o mock preserva a semântica de throw
  // para os testes assertarem o destino.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

import {
  alterarSenha,
  forgotPassword,
  login,
  signup,
  updatePassword,
} from "@/actions/auth"
import { createClient } from "@/lib/supabase/server"

const mockCreateClient = vi.mocked(createClient)

function formData(campos: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  return fd
}

interface AuthCenario {
  user?: { id: string; email?: string } | null
  signUp?: { session: object | null } | { error: true }
  signInError?: boolean
  resetError?: boolean
  updateError?: boolean
}

function montarAuthClient(c: AuthCenario = {}) {
  const signUpSpy = vi.fn(async () =>
    c.signUp && "error" in c.signUp
      ? { data: { user: null, session: null }, error: { message: "boom", code: "x" } }
      : {
          data: {
            user: { id: "u1" },
            session: c.signUp && "session" in c.signUp ? c.signUp.session : null,
          },
          error: null,
        }
  )
  const signInSpy = vi.fn(async () => ({
    error: c.signInError ? { message: "invalid" } : null,
  }))
  const resetSpy = vi.fn(async () => ({
    error: c.resetError ? { message: "rate limit", code: "y" } : null,
  }))
  const updateSpy = vi.fn(async () => ({
    error: c.updateError ? { message: "weak", code: "z" } : null,
  }))
  const client = {
    auth: {
      signUp: signUpSpy,
      signInWithPassword: signInSpy,
      resetPasswordForEmail: resetSpy,
      updateUser: updateSpy,
      getUser: vi.fn(async () => ({ data: { user: c.user ?? null }, error: null })),
    },
  }
  mockCreateClient.mockResolvedValue(client as unknown as never)
  return { signUpSpy, signInSpy, resetSpy, updateSpy }
}

const CADASTRO_OK = {
  nome: "Maria Silva",
  email: "maria@exemplo.com",
  celular: "(11) 91234-5678",
  password: "supersegura",
}

beforeEach(() => vi.clearAllMocks())

// -------------------------------- login --------------------------------

describe("login", () => {
  it("entrada inválida não toca o Supabase", async () => {
    const r = await login({}, formData({ email: "nao-e-email", password: "123" }))
    expect(r.fieldErrors?.email).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("credencial errada vira mensagem genérica (anti-enumeração)", async () => {
    montarAuthClient({ signInError: true })
    const r = await login({}, formData({ email: "a@b.co", password: "errada123" }))
    expect(r).toEqual({ error: "E-mail ou senha inválidos." })
  })

  it("sucesso redireciona ao destino interno", async () => {
    montarAuthClient()
    await expect(
      login({}, formData({ email: "a@b.co", password: "correta123" }))
    ).rejects.toThrow(/^NEXT_REDIRECT:\/dashboard$/)
  })

  it("redirectTo externo é neutralizado (open-redirect)", async () => {
    montarAuthClient()
    await expect(
      login(
        {},
        formData({
          email: "a@b.co",
          password: "correta123",
          redirectTo: "https://evil.example",
        })
      )
    ).rejects.toThrow(/^NEXT_REDIRECT:\/dashboard$/)
  })

  it("exceção de rede vira mensagem genérica (não vira 500)", async () => {
    const { signInSpy } = montarAuthClient()
    signInSpy.mockRejectedValueOnce(new Error("network down"))
    const r = await login({}, formData({ email: "a@b.co", password: "correta123" }))
    expect(r).toEqual({ error: "Não foi possível entrar agora. Tente novamente." })
  })
})

// -------------------------------- signup -------------------------------

describe("signup", () => {
  it("entrada inválida (celular fora do padrão BR) não toca o Supabase", async () => {
    const r = await signup({}, formData({ ...CADASTRO_OK, celular: "1234" }))
    expect(r.fieldErrors?.celular).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("envia metadata nome/celular (normalizado) e emailRedirectTo para /auth/confirm", async () => {
    const { signUpSpy } = montarAuthClient({ signUp: { session: null } })
    await signup({}, formData(CADASTRO_OK))

    expect(signUpSpy).toHaveBeenCalledWith({
      email: "maria@exemplo.com",
      password: "supersegura",
      options: {
        // o schema normaliza para E.164: o trigger grava o perfil com isso.
        data: { nome: "Maria Silva", celular: "+5511912345678" },
        emailRedirectTo: "http://localhost:3000/auth/confirm?next=%2Fdashboard",
      },
    })
  })

  it("redirectTo interno (ex.: convite) viaja no next do e-mail de confirmação", async () => {
    const { signUpSpy } = montarAuthClient({ signUp: { session: null } })
    await signup(
      {},
      formData({ ...CADASTRO_OK, redirectTo: "/convite/abc123def456ghj7" })
    )
    expect(signUpSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "http://localhost:3000/auth/confirm?next=%2Fconvite%2Fabc123def456ghj7",
        }),
      })
    )
  })

  it("redirectTo externo é sanitizado para /dashboard (anti open-redirect)", async () => {
    const { signUpSpy } = montarAuthClient({ signUp: { session: null } })
    await signup(
      {},
      formData({ ...CADASTRO_OK, redirectTo: "https://evil.example/phish" })
    )
    expect(signUpSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "http://localhost:3000/auth/confirm?next=%2Fdashboard",
        }),
      })
    )
  })

  it("com sessão, redirectTo interno é o destino do redirect", async () => {
    montarAuthClient({ signUp: { session: { access_token: "t" } } })
    await expect(
      signup({}, formData({ ...CADASTRO_OK, redirectTo: "/convite/abc123def456ghj7" }))
    ).rejects.toThrow("NEXT_REDIRECT:/convite/abc123def456ghj7")
  })

  it("sem sessão (confirmação ligada) retorna estado de sucesso, sem redirect", async () => {
    montarAuthClient({ signUp: { session: null } })
    const r = await signup({}, formData(CADASTRO_OK))
    expect(r.success).toMatch(/confirmação/i)
    expect(r.error).toBeUndefined()
  })

  it("com sessão (confirmação desligada) redireciona ao dashboard", async () => {
    montarAuthClient({ signUp: { session: { access_token: "t" } } })
    await expect(signup({}, formData(CADASTRO_OK))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard"
    )
  })

  it("erro do Supabase vira mensagem genérica (não revela se o e-mail existe)", async () => {
    montarAuthClient({ signUp: { error: true } })
    const r = await signup({}, formData(CADASTRO_OK))
    expect(r).toEqual({
      error: "Não foi possível criar a conta agora. Tente novamente.",
    })
  })

  it("e-mail JÁ cadastrado é indistinguível do cadastro novo (anti-enumeração)", async () => {
    // Supabase com confirmação ligada devolve usuário ofuscado e session=null
    // para e-mail repetido — mesmo shape do cadastro novo sem sessão.
    montarAuthClient({ signUp: { session: null } })
    const novo = await signup({}, formData(CADASTRO_OK))

    vi.clearAllMocks()
    montarAuthClient({ signUp: { session: null } })
    const repetido = await signup({}, formData(CADASTRO_OK))

    expect(novo).toEqual(repetido)
    expect(novo.success).toBeTruthy()
  })

  it("exceção de rede vira mensagem genérica (não vira 500)", async () => {
    const { signUpSpy } = montarAuthClient({ signUp: { session: null } })
    signUpSpy.mockRejectedValueOnce(new Error("network down"))
    const r = await signup({}, formData(CADASTRO_OK))
    expect(r).toEqual({
      error: "Não foi possível criar a conta agora. Tente novamente.",
    })
  })
})

// ---------------------------- forgotPassword ----------------------------

describe("forgotPassword", () => {
  it("e-mail inválido não toca o Supabase", async () => {
    const r = await forgotPassword({}, formData({ email: "nao-e-email" }))
    expect(r.fieldErrors?.email).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("chama resetPasswordForEmail com redirectTo para /auth/confirm → /atualizar-senha", async () => {
    const { resetSpy } = montarAuthClient()
    await forgotPassword({}, formData({ email: "a@b.co" }))
    expect(resetSpy).toHaveBeenCalledWith("a@b.co", {
      redirectTo: "http://localhost:3000/auth/confirm?next=/atualizar-senha",
    })
  })

  it("responde a MESMA mensagem com sucesso e com erro interno (anti-enumeração)", async () => {
    montarAuthClient()
    const ok = await forgotPassword({}, formData({ email: "a@b.co" }))

    vi.clearAllMocks()
    montarAuthClient({ resetError: true })
    const comErro = await forgotPassword({}, formData({ email: "a@b.co" }))

    expect(ok).toEqual(comErro)
    expect(ok.success).toBeTruthy()
    expect(ok.error).toBeUndefined()
  })

  it("mantém a mesma resposta mesmo quando o Supabase LANÇA (anti-enumeração no catch)", async () => {
    const { resetSpy } = montarAuthClient()
    resetSpy.mockRejectedValueOnce(new Error("network down"))
    const r = await forgotPassword({}, formData({ email: "a@b.co" }))
    expect(r.success).toBeTruthy()
    expect(r.error).toBeUndefined()
  })
})

// ---------------------------- updatePassword ----------------------------

describe("updatePassword", () => {
  const SENHAS = { password: "novasenha1", confirm: "novasenha1" }

  it("senhas diferentes retornam erro de campo, sem tocar o Supabase", async () => {
    const r = await updatePassword(
      {},
      formData({ password: "novasenha1", confirm: "outra" })
    )
    expect(r.fieldErrors?.confirm).toBeTruthy()
    expect(mockCreateClient).not.toHaveBeenCalled()
  })

  it("sem sessão rejeita e NÃO altera senha (defesa em profundidade)", async () => {
    const { updateSpy } = montarAuthClient({ user: null })
    const r = await updatePassword({}, formData(SENHAS))
    expect(r.error).toMatch(/novo link/i)
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("com sessão atualiza a senha e redireciona", async () => {
    const { updateSpy } = montarAuthClient({ user: { id: "u1" } })
    await expect(updatePassword({}, formData(SENHAS))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard"
    )
    expect(updateSpy).toHaveBeenCalledWith({ password: "novasenha1" })
  })

  it("erro do Supabase vira mensagem genérica", async () => {
    montarAuthClient({ user: { id: "u1" }, updateError: true })
    const r = await updatePassword({}, formData(SENHAS))
    expect(r).toEqual({
      error: "Não foi possível atualizar a senha. Tente novamente.",
    })
  })
})

// ----------------------------- alterarSenha -----------------------------

describe("alterarSenha (usuário autenticado)", () => {
  const ALTERAR_OK = {
    senhaAtual: "atual123",
    novaSenha: "novaSegura",
    confirmar: "novaSegura",
  }
  const USER = { id: "u1", email: "maria@exemplo.com" }

  it("campos inválidos (confirmação divergente) não tocam o Supabase", async () => {
    const { signInSpy, updateSpy } = montarAuthClient({ user: USER })
    const r = await alterarSenha(
      {},
      formData({ ...ALTERAR_OK, confirmar: "outra" })
    )
    expect(r.error).toMatch(/campos destacados/i)
    expect(r.fieldErrors?.confirmar?.[0]).toMatch(/não coincidem/i)
    expect(signInSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("sem sessão (ou sem e-mail) rejeita sem alterar", async () => {
    const { signInSpy, updateSpy } = montarAuthClient({ user: null })
    const r = await alterarSenha({}, formData(ALTERAR_OK))
    expect(r.error).toMatch(/sess[aã]o expirada/i)
    expect(signInSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("senha atual incorreta vira fieldError, sem gravar a nova", async () => {
    const { signInSpy, updateSpy } = montarAuthClient({
      user: USER,
      signInError: true,
    })
    const r = await alterarSenha({}, formData(ALTERAR_OK))
    expect(r.fieldErrors?.senhaAtual?.[0]).toMatch(/atual incorreta/i)
    // Re-autenticou com a senha ATUAL informada.
    expect(signInSpy).toHaveBeenCalledWith({
      email: USER.email,
      password: "atual123",
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("sucesso: re-autentica, grava a nova senha e confirma sem redirect", async () => {
    const { signInSpy, updateSpy } = montarAuthClient({ user: USER })
    const r = await alterarSenha({}, formData(ALTERAR_OK))
    expect(r).toEqual({ success: "Senha alterada com sucesso." })
    expect(signInSpy).toHaveBeenCalledWith({
      email: USER.email,
      password: "atual123",
    })
    expect(updateSpy).toHaveBeenCalledWith({ password: "novaSegura" })
  })

  it("falha do updateUser vira mensagem genérica", async () => {
    const { updateSpy } = montarAuthClient({ user: USER, updateError: true })
    const r = await alterarSenha({}, formData(ALTERAR_OK))
    expect(r.error).toMatch(/não foi possível alterar/i)
    expect(updateSpy).toHaveBeenCalled()
  })
})
