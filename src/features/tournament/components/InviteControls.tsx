"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { regenerarConvite } from "@/actions/participants"
import { Button } from "@/components/ui/button"

/**
 * Copiar o link de convite. `navigator.clipboard` exige contexto seguro
 * (https/localhost) — fora dele, ou se o navegador negar, o fallback é o
 * usuário copiar manualmente o texto exibido ao lado.
 */
export function CopyInviteLinkButton({ url }: { url: string }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          toast.success("Link copiado.")
        } catch {
          toast.error("Não foi possível copiar. Selecione e copie o link manualmente.")
        }
      }}
    >
      Copiar link
    </Button>
  )
}

/** Gera o primeiro código ou troca o atual (o link antigo deixa de valer). */
export function RegenerateInviteButton({
  tournamentId,
  temConvite,
}: {
  tournamentId: string
  temConvite: boolean
}) {
  const [pendente, startTransition] = useTransition()

  return (
    <Button
      type="button"
      size="sm"
      variant={temConvite ? "outline" : "default"}
      disabled={pendente}
      onClick={() =>
        startTransition(async () => {
          const r = await regenerarConvite(tournamentId)
          if (r.ok) toast.success(temConvite ? "Novo link gerado. O anterior deixou de valer." : "Link de convite gerado.")
          else toast.error(r.error)
        })
      }
    >
      {pendente
        ? "Gerando…"
        : temConvite
          ? "Gerar novo link"
          : "Gerar link de convite"}
    </Button>
  )
}
