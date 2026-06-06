"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { env } from "@/lib/env"
import { safeRedirectPath } from "@/lib/safe-redirect"
import { createClient } from "@/lib/supabase/server"
import {
  forgotPasswordSchema,
  loginSchema,
  signupSchema,
  updatePasswordSchema,
} from "@/schema/authSchema"

export type AuthState = {
  error?: string
  /** Estado terminal de sucesso SEM redirect (ex.: "confira seu e-mail"). */
  success?: string
  fieldErrors?: Record<string, string[] | undefined>
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()

  let signInFailed = false
  try {
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    signInFailed = Boolean(error)
  } catch {
    // Falha de rede/timeout: não vaza stack nem vira 500.
    return { error: "Não foi possível entrar agora. Tente novamente." }
  }

  if (signInFailed) {
    // Mensagem genérica: não revela se o e-mail existe.
    return { error: "E-mail ou senha inválidos." }
  }

  // redirect() deve ficar FORA de try/catch (lança NEXT_REDIRECT).
  const destino = safeRedirectPath(formData.get("redirectTo"))
  revalidatePath("/", "layout")
  redirect(destino)
}

/**
 * Cadastro self-service. `nome`/`celular` viajam como metadata do Auth — o
 * trigger `handle_new_user` cria o perfil em `public.users` (sem INSERT aqui).
 * Tolera os dois modos do projeto: confirmação de e-mail LIGADA (sem sessão →
 * "confira seu e-mail") e desligada (sessão → dashboard). Mensagens genéricas:
 * não revelam se o e-mail já tem conta (anti-enumeração — com confirmação
 * ligada o próprio Supabase responde usuário ofuscado para e-mail repetido).
 */
export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    celular: formData.get("celular"),
    password: formData.get("password"),
  })

  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const { nome, email, celular, password } = parsed.data
  const supabase = await createClient()

  // Destino pós-cadastro opcional (ex.: cadastro vindo de /convite/[codigo]
  // volta ao convite após confirmar o e-mail) — sanitizado contra open-redirect
  // e propagado pelo `next` do /auth/confirm, que valida de novo.
  const destino = safeRedirectPath(formData.get("redirectTo"))

  let comSessao = false
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nome, celular },
        emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=${encodeURIComponent(destino)}`,
      },
    })
    if (error) {
      console.error("signUp falhou", error.code ?? error.message)
      return { error: "Não foi possível criar a conta agora. Tente novamente." }
    }
    comSessao = Boolean(data.session)
  } catch {
    return { error: "Não foi possível criar a conta agora. Tente novamente." }
  }

  if (!comSessao) {
    return {
      success:
        "Conta criada! Enviamos um link de confirmação para o seu e-mail.",
    }
  }

  revalidatePath("/", "layout")
  redirect(destino)
}

/**
 * Solicita o link de recuperação. SEMPRE responde com a mesma mensagem
 * neutra, exista ou não a conta e mesmo em erro interno (anti-enumeração) —
 * o erro fica só no log do servidor.
 */
export async function forgotPassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  })

  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      parsed.data.email,
      {
        redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?next=/atualizar-senha`,
      }
    )
    if (error) {
      console.error("resetPasswordForEmail falhou", error.code ?? error.message)
    }
  } catch (erro) {
    console.error("resetPasswordForEmail indisponível", erro)
  }

  return {
    success: "Se houver uma conta para este e-mail, enviamos o link de recuperação.",
  }
}

/**
 * Define a nova senha sobre a sessão de recovery (criada pelo link de
 * e-mail via `/auth/confirm`). Exige sessão: o middleware já protege
 * `/atualizar-senha`, e a checagem aqui é defesa em profundidade (a action
 * é um endpoint HTTP invocável por fora da página).
 */
export async function updatePassword(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  })

  if (!parsed.success) {
    return {
      error: "Verifique os campos destacados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      error: "Sessão expirada. Solicite um novo link de recuperação.",
    }
  }

  try {
    const { error } = await supabase.auth.updateUser({
      password: parsed.data.password,
    })
    if (error) {
      console.error("updateUser falhou", error.code ?? error.message)
      return { error: "Não foi possível atualizar a senha. Tente novamente." }
    }
  } catch {
    return { error: "Não foi possível atualizar a senha. Tente novamente." }
  }

  revalidatePath("/", "layout")
  redirect("/dashboard")
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
