"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { removerMembro } from "@/actions/equipe"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { Escopo } from "@/schema/equipe"

/**
 * Remove um membro da equipe — ação IRREVERSÍVEL, logo com confirmação em
 * Dialog (decisão de produto: nenhum clique único expulsa). O botão é UX; a
 * autorização real é a action + RLS. O `revalidatePath` da action atualiza a
 * lista após sucesso.
 */
export function RemoveMemberButton({
  escopo,
  alvoId,
  userId,
  nome,
}: {
  escopo: Escopo
  alvoId: string
  userId: string
  nome: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pendente, startTransition] = useTransition()

  function confirmar() {
    startTransition(async () => {
      const r = await removerMembro(escopo, alvoId, userId)
      if (r.ok) {
        toast.success(`${nome} foi removido da equipe.`)
        setAberto(false)
      } else {
        toast.error(r.error)
      }
    })
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          // Alvo de toque de 44px no mobile para ação irreversível.
          className="min-h-11 px-4"
        >
          Remover
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remover da equipe?</DialogTitle>
          <DialogDescription>
            {`${nome} perde o acesso aos bastidores deste campeonato. Você pode adicioná-lo de novo depois.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11"
            disabled={pendente}
            onClick={confirmar}
          >
            {pendente ? "Removendo…" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
