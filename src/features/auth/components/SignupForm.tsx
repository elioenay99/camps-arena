"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { signup, type AuthState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: AuthState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando conta…" : "Criar conta"}
    </Button>
  )
}

export function SignupForm() {
  const [state, formAction] = useActionState(signup, initialState)

  // Estado terminal: cadastro feito, confirmação pendente no e-mail.
  if (state.success) {
    return (
      <p className="text-sm" role="status">
        {state.success}
      </p>
    )
  }

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          autoComplete="name"
          placeholder="Seu nome"
          aria-invalid={Boolean(state.fieldErrors?.nome)}
          required
        />
        {state.fieldErrors?.nome ? (
          <p className="text-destructive text-sm">{state.fieldErrors.nome[0]}</p>
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
          required
        />
        {state.fieldErrors?.email ? (
          <p className="text-destructive text-sm">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="celular">Celular</Label>
        <Input
          id="celular"
          name="celular"
          type="tel"
          autoComplete="tel-national"
          placeholder="(11) 91234-5678"
          aria-invalid={Boolean(state.fieldErrors?.celular)}
          required
        />
        {state.fieldErrors?.celular ? (
          <p className="text-destructive text-sm">
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
          required
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-sm">
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
