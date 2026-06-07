"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import {
  aceitarConviteVaga,
  type AceitarConviteVagaFormState,
} from "@/actions/slots"
import { Button } from "@/components/ui/button"

const initialState: AceitarConviteVagaFormState = {}

function SubmitButton() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Assumindo…" : "Assumir o clube"}
    </Button>
  )
}

/**
 * O ACEITE da VAGA é este clique — assume o clube como técnico (nunca
 * automático ao abrir o link; consentimento). O código viaja como hidden; a
 * validação real do segredo + o UPDATE atômico filtrado são do RPC
 * `aceitar_convite_vaga` (via a action `aceitarConviteVaga`).
 */
export function AcceptSlotInviteForm({ codigo }: { codigo: string }) {
  const [state, formAction] = useActionState(aceitarConviteVaga, initialState)

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
