"use client"

import * as React from "react"
import { Minus, Plus, X } from "lucide-react"
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
import { registrarAutoresLado } from "@/actions/matchGoals"

/** Um autor já gravado de um lado (exibição read-only e preload). */
export interface AutorGravado {
  jogador: string | null
  gols: number
  contra: boolean
}

/** Dados de UM lado editável (técnico: o próprio; árbitro: cada um dos dois). */
export interface LadoEditavel {
  lado: 1 | 2
  nomeLado: string
  /** Placar do lado — o TETO ("X de Y gols atribuídos"). */
  placar: number
  /** Autores já gravados do lado (read-only no append; preload no replace). */
  existentes: AutorGravado[]
}

interface LinhaEdit {
  jogador: string
  gols: number
  contra: boolean
}

function somaGols(itens: { gols: number }[]): number {
  return itens.reduce((acc, i) => acc + (i.gols || 0), 0)
}

/**
 * Editor de artilheiros de uma partida ENCERRADA competitiva (add-artilharia-
 * colaborativa). Duas superfícies num só componente, distinguidas por `modo`:
 *
 *  - `append` (TÉCNICO do lado): os autores já gravados aparecem SOMENTE-LEITURA;
 *    a área de adicionar mostra o orçamento restante ("X de Y gols atribuídos") e,
 *    no salvar, submete APENAS o DELTA (as entradas novas) — a RPC já soma o
 *    existente (reenviar o preload DOBRARIA). Trava a edição ao lado do técnico.
 *  - `replace` (ÁRBITRO): editor COMPLETO dos dois lados; cada lado abre
 *    PRÉ-CARREGADO (editável) e submete a LISTA COMPLETA (substitui o lado).
 */
export function ArtilheirosEncerrada({
  matchId,
  modo,
  lados,
  triggerLabel,
  triggerVariant = "secondary",
}: {
  matchId: string
  modo: "append" | "replace"
  lados: LadoEditavel[]
  triggerLabel: string
  triggerVariant?: "secondary" | "outline" | "ghost"
}) {
  const [open, setOpen] = React.useState(false)
  const [salvando, startSalvar] = React.useTransition()
  // Estado por lado das linhas EDITÁVEIS (append: só as novas; replace: a lista).
  const [novasPorLado, setNovasPorLado] = React.useState<Record<1 | 2, LinhaEdit[]>>({
    1: [],
    2: [],
  })

  const preloadReplace = React.useCallback(
    (l: LadoEditavel): LinhaEdit[] =>
      l.existentes.map((a) => ({
        jogador: a.jogador ?? "",
        gols: a.gols,
        contra: a.contra,
      })),
    []
  )

  function reset(next: boolean) {
    if (!next && salvando) return
    if (next) {
      const base: Record<1 | 2, LinhaEdit[]> = { 1: [], 2: [] }
      if (modo === "replace") {
        for (const l of lados) base[l.lado] = preloadReplace(l)
      }
      setNovasPorLado(base)
    }
    setOpen(next)
  }

  const atualizar = (lado: 1 | 2, linhas: LinhaEdit[]) =>
    setNovasPorLado((prev) => ({ ...prev, [lado]: linhas }))

  function handleSalvar() {
    startSalvar(async () => {
      try {
        for (const l of lados) {
          const linhas = novasPorLado[l.lado]
          // Descarta linhas de gol NORMAL sem nome; o contra pode ser anônimo.
          const limpo = linhas
            .map((r) => ({ jogador: r.jogador.trim(), gols: r.gols, contra: r.contra }))
            .filter((r) => r.contra || r.jogador !== "")

          if (modo === "append") {
            // Só o DELTA (as linhas novas); nada a fazer se vazio.
            if (limpo.length === 0) continue
            const payload = limpo.map((r) => ({
              jogador: r.contra && r.jogador === "" ? null : r.jogador,
              gols: r.gols,
              contra: r.contra,
            }))
            const r = await registrarAutoresLado({
              matchId,
              lado: l.lado,
              autores: payload,
              modo: "append",
            })
            if (!r.ok) throw new Error(r.error)
          } else {
            // Replace: a LISTA COMPLETA do lado (pode esvaziar).
            const payload = limpo.map((r) => ({
              jogador: r.contra && r.jogador === "" ? null : r.jogador,
              gols: r.gols,
              contra: r.contra,
            }))
            const r = await registrarAutoresLado({
              matchId,
              lado: l.lado,
              autores: payload,
              modo: "replace",
            })
            if (!r.ok) throw new Error(r.error)
          }
        }
        toast.success("Artilheiros atualizados.")
        setOpen(false)
      } catch (erro) {
        toast.error(
          erro instanceof Error && erro.message
            ? erro.message
            : "Não foi possível salvar os artilheiros. Tente novamente."
        )
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={triggerVariant}
          // Alvo de toque de 44px no mobile (padrão do projeto para ação);
          // no desktop volta à altura compacta.
          className="min-h-11 md:min-h-9"
        >
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-center text-lg font-bold">
            {modo === "append" ? "Meus artilheiros" : "Artilheiros da partida"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            {modo === "append"
              ? "Complete os autores dos gols do seu lado."
              : "Corrija os autores dos dois lados."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {lados.map((l) => (
            <LadoEditor
              key={l.lado}
              modo={modo}
              lado={l}
              novas={novasPorLado[l.lado]}
              onChange={(linhas) => atualizar(l.lado, linhas)}
            />
          ))}
        </DialogBody>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <span className="sr-only" role="status" aria-live="polite">
            {salvando ? "Salvando artilheiros…" : ""}
          </span>
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="w-full rounded-full"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={salvando} className="w-full rounded-full">
              Fechar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Bloco de UM lado no editor: read-only dos existentes (append) + linhas editáveis. */
function LadoEditor({
  modo,
  lado,
  novas,
  onChange,
}: {
  modo: "append" | "replace"
  lado: LadoEditavel
  novas: LinhaEdit[]
  onChange: (linhas: LinhaEdit[]) => void
}) {
  // Orçamento: no append o já atribuído são os `existentes`; no replace é a soma
  // das linhas editáveis (o preload substituiu o existente).
  const jaAtribuido =
    modo === "append" ? somaGols(lado.existentes) : somaGols(novas)
  const somaNovas = modo === "append" ? somaGols(novas) : 0
  const total = jaAtribuido + somaNovas
  const excede = total > lado.placar

  const atualizarLinha = (i: number, patch: Partial<LinhaEdit>) =>
    onChange(novas.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const remover = (i: number) => onChange(novas.filter((_, idx) => idx !== i))
  const adicionar = () => onChange([...novas, { jogador: "", gols: 1, contra: false }])

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{lado.nomeLado}</span>
        <span
          className={`text-xs tabular-nums ${excede ? "text-destructive" : "text-muted-foreground"}`}
        >
          {total} de {lado.placar} gols atribuídos
        </span>
      </div>

      {/* Append: existentes SOMENTE-LEITURA (o técnico não edita/remove). */}
      {modo === "append" && lado.existentes.length > 0 ? (
        <ul className="flex list-none flex-col gap-1 p-0 text-sm">
          {lado.existentes.map((a, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-muted-foreground">
              <span className="truncate">
                {a.contra ? (a.jogador?.trim() ? `${a.jogador} (gol contra)` : "Gol contra") : a.jogador}
              </span>
              <span className="tabular-nums">{a.gols}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {novas.length > 0 ? (
        <ul className="flex list-none flex-col gap-1.5 p-0">
          {novas.map((linha, i) => {
            const rotulo = linha.jogador.trim() || (linha.contra ? "gol contra" : `autor ${i + 1}`)
            return (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={linha.jogador}
                    onChange={(e) => atualizarLinha(i, { jogador: e.target.value })}
                    placeholder={linha.contra ? "Gol contra (nome opcional)" : "Nome do autor"}
                    aria-label={`Autor ${i + 1} de ${lado.nomeLado}`}
                    maxLength={60}
                    className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-sm md:h-9"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Diminuir gols de ${rotulo}`}
                      aria-disabled={linha.gols <= 1}
                      className="size-11 aria-disabled:opacity-50 md:size-9"
                      onClick={() => linha.gols > 1 && atualizarLinha(i, { gols: linha.gols - 1 })}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <span className="min-w-6 text-center text-sm font-semibold tabular-nums" aria-hidden="true">
                      {linha.gols}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Aumentar gols de ${rotulo}`}
                      aria-disabled={linha.gols >= 99}
                      className="size-11 aria-disabled:opacity-50 md:size-9"
                      onClick={() => linha.gols < 99 && atualizarLinha(i, { gols: linha.gols + 1 })}
                    >
                      <Plus aria-hidden="true" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${rotulo}`}
                    className="text-muted-foreground size-11 md:size-9"
                    onClick={() => remover(i)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </div>
                <label className="text-muted-foreground flex items-center gap-1.5 self-start text-xs">
                  <input
                    type="checkbox"
                    checked={linha.contra}
                    onChange={(e) => atualizarLinha(i, { contra: e.target.checked })}
                    className="size-4"
                  />
                  Gol contra (fora do ranking)
                </label>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={adicionar}
        className="min-h-11 self-start rounded-full md:min-h-9"
      >
        <Plus aria-hidden="true" />
        Adicionar autor
      </Button>

      {excede ? (
        <p role="status" className="text-destructive text-xs">
          Os autores somam mais gols que o placar deste lado.
        </p>
      ) : null}
    </div>
  )
}
