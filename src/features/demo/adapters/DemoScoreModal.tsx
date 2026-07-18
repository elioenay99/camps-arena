"use client"

import * as React from "react"
import { Minus, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { useDemoStore } from "@/features/demo/store/useDemoStore"
import type { IdentidadeDemo, TorneioDemo } from "@/features/demo/store/tipos"

// Placar interativo da demonstração. RECONSTRUÍDO no namespace demo (não envolve
// o `MatchScoreModal` de produção, que importa `TeamSearchInput` → `@/actions/teams`
// e violaria o isolamento — o guard de grafo pega isso). Mesma UX essencial:
// steppers de placar + captura de autores por lado (teto = placar). O `onSave`
// grava no store (EDITAR_PLACAR + REGISTRAR_AUTORES) e mostra toast honesto.

interface LinhaAutor {
  jogador: string
  gols: number
}

function Identidade({
  ident,
  nome,
}: {
  ident: IdentidadeDemo | undefined
  nome: string
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {ident && !ident.ehCompetitivo ? (
        <UserAvatar nome={nome} avatarUrl={ident.avatarUrl} size={22} />
      ) : (
        <TeamCrest nome={nome} escudoUrl={ident?.escudoUrl ?? null} size={22} />
      )}
      <span className="truncate text-sm font-medium">{nome}</span>
    </span>
  )
}

function CapturaAutores({
  nomeLado,
  placar,
  sugestoes,
  autores,
  onChange,
}: {
  nomeLado: string
  placar: number
  sugestoes: string[]
  autores: LinhaAutor[]
  onChange: (proximo: LinhaAutor[]) => void
}) {
  const soma = autores.reduce((acc, a) => acc + (a.gols || 0), 0)
  const excede = soma > placar
  const listId = React.useId()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{nomeLado}</span>
        <span
          className={`text-xs tabular-nums ${excede ? "text-destructive" : "text-muted-foreground"}`}
        >
          {soma}/{placar} gols
        </span>
      </div>
      <datalist id={listId}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {autores.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {autores.map((linha, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="text"
                list={listId}
                value={linha.jogador}
                onChange={(e) =>
                  onChange(
                    autores.map((a, idx) =>
                      idx === i ? { ...a, jogador: e.target.value } : a
                    )
                  )
                }
                placeholder="Nome do autor"
                aria-label={`Autor ${i + 1} de ${nomeLado}`}
                maxLength={60}
                className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-sm md:h-9"
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Diminuir gols do autor ${i + 1}`}
                  className="size-11 md:size-9"
                  onClick={() =>
                    linha.gols > 1 &&
                    onChange(
                      autores.map((a, idx) =>
                        idx === i ? { ...a, gols: a.gols - 1 } : a
                      )
                    )
                  }
                >
                  <Minus aria-hidden />
                </Button>
                <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
                  {linha.gols}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Aumentar gols do autor ${i + 1}`}
                  className="size-11 md:size-9"
                  onClick={() =>
                    onChange(
                      autores.map((a, idx) =>
                        idx === i ? { ...a, gols: a.gols + 1 } : a
                      )
                    )
                  }
                >
                  <Plus aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover autor ${i + 1}`}
                  className="size-11 md:size-9"
                  onClick={() => onChange(autores.filter((_, idx) => idx !== i))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => onChange([...autores, { jogador: "", gols: 1 }])}
      >
        <Plus aria-hidden className="size-3.5" />
        Adicionar autor
      </Button>
    </div>
  )
}

function Stepper({
  valor,
  onChange,
  rotulo,
}: {
  valor: number
  onChange: (n: number) => void
  rotulo: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Diminuir placar de ${rotulo}`}
        className="size-11 md:size-9"
        onClick={() => onChange(Math.max(0, valor - 1))}
      >
        <Minus aria-hidden />
      </Button>
      <span className="min-w-8 text-center font-display text-xl tabular-nums">
        {valor}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Aumentar placar de ${rotulo}`}
        className="size-11 md:size-9"
        onClick={() => onChange(valor + 1)}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}

export function DemoScoreModal({
  torneio,
  matchId,
  participante1Id,
  participante2Id,
  rodada,
  placar1,
  placar2,
  triggerLabel,
  triggerClassName,
  triggerAriaLabel,
}: {
  torneio: TorneioDemo
  matchId: string
  participante1Id: string | null
  participante2Id: string | null
  rodada: number | null
  placar1: number
  placar2: number
  triggerLabel: string
  triggerClassName?: string
  triggerAriaLabel?: string
}) {
  const { state, dispatch } = useDemoStore()
  const [aberto, setAberto] = React.useState(false)

  const ident1 = participante1Id ? state.identidades[participante1Id] : undefined
  const ident2 = participante2Id ? state.identidades[participante2Id] : undefined
  const nome1 = ident1?.nome ?? "A definir"
  const nome2 = ident2?.nome ?? "A definir"

  const golsIniciais = React.useMemo(() => {
    const doMatch = torneio.gols.filter((g) => g.matchId === matchId && !g.contra)
    const map = (lado: 1 | 2): LinhaAutor[] =>
      doMatch
        .filter((g) => g.lado === lado)
        .map((g) => ({ jogador: g.jogador, gols: g.gols }))
    return { 1: map(1), 2: map(2) }
  }, [torneio.gols, matchId])

  const [p1, setP1] = React.useState(placar1)
  const [p2, setP2] = React.useState(placar2)
  const [autores1, setAutores1] = React.useState<LinhaAutor[]>(golsIniciais[1])
  const [autores2, setAutores2] = React.useState<LinhaAutor[]>(golsIniciais[2])

  // Reabrir sincroniza com o estado atual da partida.
  const aoAbrir = (open: boolean) => {
    setAberto(open)
    if (open) {
      setP1(placar1)
      setP2(placar2)
      setAutores1(golsIniciais[1])
      setAutores2(golsIniciais[2])
    }
  }

  const sugestoes = React.useMemo(
    () => [...new Set(torneio.gols.map((g) => g.jogador).filter(Boolean))],
    [torneio.gols]
  )

  const salvar = () => {
    // Invariante teto = placar (espelha o MatchScoreModal de produção): a soma de
    // gols de um lado não pode exceder o placar daquele lado — bloqueia o salvar.
    const soma1 = autores1.reduce((a, x) => a + (x.gols || 0), 0)
    const soma2 = autores2.reduce((a, x) => a + (x.gols || 0), 0)
    if (soma1 > p1 || soma2 > p2) {
      toast.error("Os autores somam mais gols que o placar do lado.")
      return
    }
    dispatch({
      type: "EDITAR_PLACAR",
      torneioId: torneio.id,
      matchId,
      placar_1: p1,
      placar_2: p2,
    })
    dispatch({
      type: "REGISTRAR_AUTORES",
      torneioId: torneio.id,
      matchId,
      autores: [
        ...autores1
          .filter((a) => a.jogador.trim() !== "")
          .map((a) => ({ lado: 1 as const, jogador: a.jogador, gols: a.gols, contra: false })),
        ...autores2
          .filter((a) => a.jogador.trim() !== "")
          .map((a) => ({ lado: 2 as const, jogador: a.jogador, gols: a.gols, contra: false })),
      ],
    })
    setAberto(false)
    toast.success("Placar atualizado na demonstração")
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={triggerClassName}
          aria-label={triggerAriaLabel ?? triggerLabel}
        >
          {triggerLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {nome1} x {nome2}
          </DialogTitle>
          <DialogDescription>
            {rodada != null ? `Rodada ${rodada} · ` : ""}Ajuste o placar e veja a
            classificação recomputar ao vivo.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <Identidade ident={ident1} nome={nome1} />
            <Stepper valor={p1} onChange={setP1} rotulo={nome1} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Identidade ident={ident2} nome={nome2} />
            <Stepper valor={p2} onChange={setP2} rotulo={nome2} />
          </div>
          <details className="rounded-lg border bg-muted/10 px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Autores dos gols
            </summary>
            <div className="mt-3 flex flex-col gap-4">
              <CapturaAutores
                nomeLado={nome1}
                placar={p1}
                sugestoes={sugestoes}
                autores={autores1}
                onChange={setAutores1}
              />
              <CapturaAutores
                nomeLado={nome2}
                placar={p2}
                sugestoes={sugestoes}
                autores={autores2}
                onChange={setAutores2}
              />
            </div>
          </details>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancelar</Button>
          </DialogClose>
          <Button onClick={salvar}>Salvar placar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
