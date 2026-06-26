import { z } from "zod"
import { parsePhoneNumberFromString } from "libphonenumber-js"

/**
 * Celular internacional, sempre normalizado para E.164 (`+5511912345678`,
 * `+351931482194`). Aceita entrada em E.164 (com `+` — país inferido pelo DDI)
 * OU nacional brasileira sem DDI (o `PhoneField` em país BR e as linhas legadas
 * de 11 dígitos gravadas pelo schema antigo — assume o Brasil). Inválido para o
 * país → erro de campo, sem gravação. O storage e o `wa.me` passam a ser
 * DDI-aware (ver `linkWhatsApp` em `src/lib/whatsapp.ts`).
 */
function paraE164(bruto: string): string | null {
  const v = bruto.trim()
  if (!v) return null
  const pn = parsePhoneNumberFromString(v, v.startsWith("+") ? undefined : "BR")
  return pn?.isValid() ? pn.number : null
}

export const celular = z
  .string()
  .trim()
  .refine((v) => paraE164(v) !== null, {
    error: "Celular inválido. Confira o país e o número.",
  })
  .transform((v) => paraE164(v)!)

export const loginSchema = z.object({
  email: z.email({ error: "E-mail inválido." }),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
})

export const signupSchema = z.object({
  nome: z.string().trim().min(2, "Informe seu nome."),
  email: z.email({ error: "E-mail inválido." }),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
  celular,
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
  celular,
})

export type LoginInput = z.infer<typeof loginSchema>
export type SignupInput = z.infer<typeof signupSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ProfileInput = z.infer<typeof profileSchema>
