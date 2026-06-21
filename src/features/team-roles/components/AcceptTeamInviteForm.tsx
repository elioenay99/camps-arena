"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { aceitarConviteMembro } from "@/actions/equipe"
import { Button } from "@/components/ui/button"

/**
 * O ACEITE é este clique — entrada explícita, nunca automática ao abrir o link
 * (consentimento do convidado, espelha o AcceptInviteForm). O `code` viaja como
 * hidden; a validação real do segredo é a RPC `aceitar_convite_membro`. Em
 * sucesso, `router.push` leva ao campeonato (torneio ou liga) conforme o escopo
 * devolvido pela action.
 */
export function AcceptTeamInviteForm({ code }: { code: string }) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()

  function aceitar() {
    startTransition(async () => {
      const r = await aceitarConviteMembro(code)
      if (r.ok) {
        const destino =
          r.escopo === "league"
            ? `/dashboard/ligas/${r.alvoId}`
            : `/dashboard/torneios/${r.alvoId}`
        router.push(destino)
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        aceitar()
      }}
    >
      <input type="hidden" name="code" value={code} />
      <Button type="submit" className="w-full" disabled={pendente}>
        {pendente ? "Entrando…" : "Aceitar convite"}
      </Button>
    </form>
  )
}
