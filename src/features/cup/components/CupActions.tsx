"use client"

import { Archive, Plus, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import * as React from "react"
import { toast } from "sonner"

import { apagarCopa, arquivarCopa, criarEdicaoCopa } from "@/actions/cups"
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

/** Botão "Nova edição" — cria a edição em rascunho e navega para ela. */
export function NovaEdicaoButton({ cupId }: { cupId: string }) {
  const router = useRouter()
  const [pendente, startTransition] = React.useTransition()

  function criar() {
    startTransition(async () => {
      const r = await criarEdicaoCopa(cupId)
      if (r.ok) {
        toast.success("Edição criada. Derive as vagas para começar.")
        router.push(`/dashboard/copas/edicao/${r.cupSeasonId}`)
        return
      }
      toast.error(r.error)
    })
  }

  return (
    <Button onClick={criar} disabled={pendente} size="sm" className="rounded-full">
      <Plus aria-hidden="true" />
      {pendente ? "Criando…" : "Nova edição"}
    </Button>
  )
}

/**
 * Ações de ciclo de vida dono-only: arquivar (reversível na prática — some das
 * listagens, histórico fica) e apagar (irreversível; bloqueada se houver edição
 * materializada — a action devolve mensagem clara). Padrão Dialog para confirmar
 * a ação irreversível.
 */
export function CupLifecycleActions({
  cupId,
  arquivada,
}: {
  cupId: string
  arquivada: boolean
}) {
  const router = useRouter()
  const [arquivando, startArquivar] = React.useTransition()
  const [apagando, startApagar] = React.useTransition()
  const [aberto, setAberto] = React.useState(false)

  function arquivar() {
    startArquivar(async () => {
      const r = await arquivarCopa(cupId)
      if (r.ok) {
        toast.success("Copa arquivada.")
        router.refresh()
        return
      }
      toast.error(r.error)
    })
  }

  function apagar() {
    startApagar(async () => {
      const r = await apagarCopa(cupId)
      if (r.ok) {
        toast.success("Copa apagada.")
        router.push("/dashboard/copas")
        return
      }
      toast.error(r.error)
      setAberto(false)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!arquivada ? (
        <Button
          onClick={arquivar}
          disabled={arquivando}
          variant="outline"
          size="sm"
          className="min-h-10 rounded-full px-4"
        >
          <Archive aria-hidden="true" />
          {arquivando ? "Arquivando…" : "Arquivar"}
        </Button>
      ) : null}

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm" className="min-h-10 rounded-full px-4">
            <Trash2 aria-hidden="true" />
            Apagar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar esta copa?</DialogTitle>
            <DialogDescription>
              As regras e as edições em rascunho são removidas. Se a copa já tem uma
              edição montada, o histórico é preservado — arquive em vez de apagar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" disabled={apagando} onClick={apagar}>
              {apagando ? "Apagando…" : "Apagar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
