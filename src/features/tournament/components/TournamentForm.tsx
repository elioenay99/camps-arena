"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { createTournament, type TournamentFormState } from "@/actions/tournaments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const initialState: TournamentFormState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Criando…" : "Criar torneio"}
    </Button>
  )
}

export function TournamentForm() {
  const [state, formAction] = useActionState(createTournament, initialState)

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          autoComplete="off"
          placeholder="Ex.: Copa da Firma 2026"
          aria-invalid={Boolean(state.fieldErrors?.titulo)}
          required
        />
        {state.fieldErrors?.titulo ? (
          <p className="text-destructive text-sm">{state.fieldErrors.titulo[0]}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="isPublic"
          name="isPublic"
          type="checkbox"
          defaultChecked
          className="size-4 rounded border-input accent-primary"
        />
        <Label htmlFor="isPublic" className="font-normal">
          Torneio público (qualquer pessoa pode ver)
        </Label>
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
