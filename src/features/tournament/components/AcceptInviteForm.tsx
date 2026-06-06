"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { aceitarConvite, type AceitarConviteFormState } from "@/actions/participants"
import { Button } from "@/components/ui/button"

const initialState: AceitarConviteFormState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar no torneio"}
    </Button>
  )
}

/**
 * O ACEITE é este clique — entrada explícita, nunca automática ao abrir o
 * link (decisão de produto: consentimento do convidado). O código viaja como
 * hidden; a validação real do segredo é a função do banco.
 */
export function AcceptInviteForm({ codigo }: { codigo: string }) {
  const [state, formAction] = useActionState(aceitarConvite, initialState)

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="codigo" value={codigo} />

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  )
}
