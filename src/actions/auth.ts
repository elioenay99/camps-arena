"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { loginSchema } from "@/schema/authSchema"

export type AuthState = {
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

/**
 * Garante redirecionamento interno (anti open-redirect):
 * aceita só caminhos que começam com "/" e não com "//".
 */
function safeRedirectPath(value: FormDataEntryValue | null): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return value
  }
  return "/dashboard"
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

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
