import { z } from "zod"

/**
 * Celular brasileiro. Aceita com ou sem máscara:
 *   (11) 91234-5678 · 11 91234-5678 · 11912345678
 * Regra: DDD (2 dígitos) + 9 + 8 dígitos = 11 dígitos no total.
 */
const SOMENTE_DIGITOS = /\D/g

export const celularBR = z
  .string()
  .trim()
  .transform((valor) => valor.replace(SOMENTE_DIGITOS, ""))
  .refine((digitos) => /^[1-9]{2}9\d{8}$/.test(digitos), {
    error: "Celular inválido. Use o formato (11) 91234-5678.",
  })

export const loginSchema = z.object({
  email: z.email({ error: "E-mail inválido." }),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
})

export const signupSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome."),
  email: z.email({ error: "E-mail inválido." }),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
  celular: celularBR,
})

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "E-mail inválido." }),
})

export const updatePasswordSchema = z
  .object({
    password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirm: z.string(),
  })
  .refine((dados) => dados.password === dados.confirm, {
    error: "As senhas não coincidem.",
    path: ["confirm"],
  })

/**
 * Alteração de senha pelo usuário AUTENTICADO (difere da recuperação por
 * e-mail): exige a senha ATUAL para re-autenticar, a nova (mín. 6) e a
 * confirmação. A nova precisa ser diferente da atual.
 */
export const changePasswordSchema = z
  .object({
    senhaAtual: z.string().min(1, "Informe sua senha atual."),
    novaSenha: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
    confirmar: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmar, {
    error: "As senhas não coincidem.",
    path: ["confirmar"],
  })
  .refine((dados) => dados.novaSenha !== dados.senhaAtual, {
    error: "A nova senha deve ser diferente da atual.",
    path: ["novaSenha"],
  })

/** Edição do próprio perfil (nome + celular). Avatar é tratado à parte (arquivo). */
export const profileSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome."),
  celular: celularBR,
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ProfileInput = z.infer<typeof profileSchema>
