"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { signup, type AuthState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneField } from "@/features/auth/components/PhoneField"

const initialState: AuthState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando conta…" : "Criar conta"}
    </Button>
  )
}

export function SignupForm({ redirectTo }: { redirectTo?: string }) {
  const [state, formAction] = useActionState(signup, initialState)

  // Estado terminal: cadastro feito, confirmação pendente no e-mail. O
  // parágrafo sozinho deixava o usuário sem próximo passo — a mensagem diz o
  // que aconteceu, não o que fazer agora.
  if (state.success) {
    return (
      <div className="grid gap-4">
        <p className="text-sm" role="status">
          {state.success}
        </p>
        <Button asChild className="w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {/* Destino pós-confirmação (sanitizado na action e no /auth/confirm). */}
      {redirectTo ? (
        <input type="hidden" name="redirectTo" value={redirectTo} />
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          autoComplete="name"
          placeholder="Seu nome"
          aria-invalid={Boolean(state.fieldErrors?.nome)}
          aria-describedby={state.fieldErrors?.nome ? "nome-erro" : undefined}
          required
        />
        {state.fieldErrors?.nome ? (
          <p id="nome-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.nome[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          aria-describedby={state.fieldErrors?.email ? "email-erro" : undefined}
          required
        />
        {state.fieldErrors?.email ? (
          <p id="email-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.email[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="celular">Celular</Label>
        <PhoneField
          id="celular"
          name="celular"
          ariaInvalid={Boolean(state.fieldErrors?.celular)}
          ariaDescribedBy={
            state.fieldErrors?.celular ? "celular-erro" : undefined
          }
          required
        />
        {state.fieldErrors?.celular ? (
          <p id="celular-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.celular[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          aria-describedby={
            state.fieldErrors?.password ? "password-erro" : undefined
          }
          required
        />
        {state.fieldErrors?.password ? (
          <p id="password-erro" role="alert" className="text-destructive text-sm">
            {state.fieldErrors.password[0]}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
