"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { alterarSenha, type AuthState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: AuthState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : "Alterar senha"}
    </Button>
  )
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(alterarSenha, initialState)

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="senhaAtual">Senha atual</Label>
        <Input
          id="senhaAtual"
          name="senhaAtual"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.senhaAtual)}
          required
        />
        {state.fieldErrors?.senhaAtual ? (
          <p className="text-destructive text-sm">
            {state.fieldErrors.senhaAtual[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="novaSenha">Nova senha</Label>
        <Input
          id="novaSenha"
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.novaSenha)}
          required
        />
        {state.fieldErrors?.novaSenha ? (
          <p className="text-destructive text-sm">
            {state.fieldErrors.novaSenha[0]}
          </p>
        ) : null}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirmar">Confirmar nova senha</Label>
        <Input
          id="confirmar"
          name="confirmar"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(state.fieldErrors?.confirmar)}
          required
        />
        {state.fieldErrors?.confirmar ? (
          <p className="text-destructive text-sm">
            {state.fieldErrors.confirmar[0]}
          </p>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-primary text-sm" role="status">
          {state.success}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
