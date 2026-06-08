"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { atualizarPerfil } from "@/actions/profile"
import type { AuthState } from "@/actions/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: AuthState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Salvando…" : "Salvar perfil"}
    </Button>
  )
}

export function ProfileForm({
  nome,
  celular,
}: {
  nome: string | null
  celular: string | null
}) {
  const [state, formAction] = useActionState(atualizarPerfil, initialState)

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="nome">Nome</Label>
        <Input
          id="nome"
          name="nome"
          defaultValue={nome ?? ""}
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
        <Label htmlFor="celular">Celular</Label>
        <Input
          id="celular"
          name="celular"
          type="tel"
          defaultValue={celular ?? ""}
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
