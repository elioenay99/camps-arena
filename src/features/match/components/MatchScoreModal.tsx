"use client"

import * as React from "react"
import { Minus, Plus, MessageCircle } from "lucide-react"
import { toast } from "sonner"

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

export interface ParticipantePartida {
  nome: string
  avatarUrl?: string | null
  /** Celular em qualquer formato; normalizado para o link wa.me. */
  celular?: string | null
}

export interface MatchScoreModalProps {
  matchId: string
  /** Ex.: "Grêmio x São Paulo" */
  tituloPartida: string
  /** Ex.: "Rodada 6 • Sem prazo" */
  subtitulo: string
  /** Ex.: "Jhonathan enfrenta Danilo" */
  descricao: string
  participante1: ParticipantePartida
  participante2: ParticipantePartida
  placarInicial1?: number
  placarInicial2?: number
  /** Gatilho customizado; se ausente, usa um botão padrão. */
  trigger?: React.ReactNode
  /**
   * Persistência do placar (Server Action na Fase 4). Recebe placares já
   * normalizados (inteiros >= 0). Sem onSave, o modal apenas confirma
   * localmente (modo demonstração).
   */
  onSave?: (input: {
    matchId: string
    placar_1: number
    placar_2: number
  }) => Promise<void> | void
}

function primeiroNome(nome: string) {
  const limpo = nome.trim()
  if (!limpo) return "participante"
  return limpo.split(/\s+/)[0]
}

function iniciais(nome: string) {
  const limpo = nome.trim()
  if (!limpo) return "?"
  return limpo
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => [...parte][0]?.toUpperCase() ?? "")
    .join("")
}

/**
 * Monta o link wa.me a partir de um celular BR. Aceita só celular válido
 * (11 dígitos sem DDI, ou 13 com o DDI 55). Fixo ou formato inválido → null.
 * O DDI é inferido pelo comprimento, não pelo prefixo (um DDD 55 não é DDI).
 */
function linkWhatsApp(celular?: string | null) {
  if (!celular) return null
  const digitos = celular.replace(/\D/g, "")
  if (digitos.length === 11) return `https://wa.me/55${digitos}`
  if (digitos.length === 13 && digitos.startsWith("55")) {
    return `https://wa.me/${digitos}`
  }
  return null
}

function Avatar({ participante }: { participante: ParticipantePartida }) {
  const [erro, setErro] = React.useState(false)
  const mostrarImagem = Boolean(participante.avatarUrl) && !erro

  return (
    <span className="flex size-16 items-center justify-center overflow-hidden rounded-full border bg-muted text-lg font-semibold">
      {mostrarImagem ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={participante.avatarUrl ?? undefined}
          alt={participante.nome || "Participante"}
          className="size-full object-cover"
          onError={() => setErro(true)}
        />
      ) : (
        <span aria-hidden="true">{iniciais(participante.nome)}</span>
      )}
    </span>
  )
}

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (proximo: number) => void
}) {
  const noMinimo = value <= 0

  return (
    <div className="flex items-center justify-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Diminuir placar de ${label}`}
        aria-disabled={noMinimo}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (noMinimo) return
          onChange(value - 1)
        }}
      >
        <Minus aria-hidden="true" />
      </Button>

      <span
        className="min-w-12 text-center text-4xl font-bold tabular-nums"
        aria-hidden="true"
      >
        {value}
      </span>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        Placar de {label}: {value}
      </span>

      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Aumentar placar de ${label}`}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}

function ColunaParticipante({
  participante,
  value,
  onChange,
}: {
  participante: ParticipantePartida
  value: number
  onChange: (proximo: number) => void
}) {
  const wa = linkWhatsApp(participante.celular)

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <Avatar participante={participante} />
        <span className="text-center text-sm font-medium">
          {participante.nome}
        </span>
      </div>

      <Stepper label={participante.nome} value={value} onChange={onChange} />

      {wa ? (
        <Button
          asChild
          className="w-full rounded-full bg-green-700 text-white hover:bg-green-800"
        >
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            Chamar {primeiroNome(participante.nome)}
            <span className="sr-only"> (abre o WhatsApp em nova aba)</span>
          </a>
        </Button>
      ) : null}
    </div>
  )
}

export function MatchScoreModal({
  matchId,
  tituloPartida,
  subtitulo,
  descricao,
  participante1,
  participante2,
  placarInicial1 = 0,
  placarInicial2 = 0,
  trigger,
  onSave,
}: MatchScoreModalProps) {
  const [open, setOpen] = React.useState(false)
  const [placar1, setPlacar1] = React.useState(placarInicial1)
  const [placar2, setPlacar2] = React.useState(placarInicial2)
  const [salvando, setSalvando] = React.useState(false)

  // Ressincroniza o estado otimista ao (re)abrir o modal — no handler, sem efeito.
  function handleOpenChange(proximo: boolean) {
    if (proximo) {
      setPlacar1(placarInicial1)
      setPlacar2(placarInicial2)
    }
    setOpen(proximo)
  }

  async function handleSalvar() {
    const normalizar = (n: number) => Math.max(0, Math.trunc(n))
    try {
      setSalvando(true)
      if (onSave) {
        await onSave({
          matchId,
          placar_1: normalizar(placar1),
          placar_2: normalizar(placar2),
        })
      } else {
        toast.success("Placar salvo (demonstração).")
      }
      setOpen(false)
    } catch (erro) {
      console.error("Falha ao salvar placar", erro)
      toast.error("Não foi possível salvar o placar. Tente novamente.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? <Button>Menu da Partida</Button>}
      </DialogTrigger>

      <DialogContent showCloseButton={false} className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <span
            aria-hidden="true"
            className="block text-center text-xs font-semibold tracking-[0.25em] text-muted-foreground"
          >
            MENU DA PARTIDA
          </span>
          <DialogTitle className="text-center text-lg font-semibold">
            {tituloPartida}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-center">
              <span className="block text-sm text-muted-foreground">
                {subtitulo}
              </span>
              <span className="block text-sm text-muted-foreground">
                {descricao}
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border bg-muted/40 p-4">
          <p className="mb-4 text-center text-sm font-medium text-muted-foreground">
            Lançar Placar
          </p>
          <div className="grid grid-cols-2 gap-4">
            <ColunaParticipante
              participante={participante1}
              value={placar1}
              onChange={setPlacar1}
            />
            <ColunaParticipante
              participante={participante2}
              value={placar2}
              onChange={setPlacar2}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="w-full rounded-full bg-green-700 text-base font-semibold text-white hover:bg-green-800"
          >
            {salvando ? "Salvando…" : "SALVAR PLACAR"}
          </Button>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-full"
            >
              FECHAR
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
