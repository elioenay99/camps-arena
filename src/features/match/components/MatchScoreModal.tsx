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
import { PLACAR_MAX } from "@/schema/matchSchema"
import { TeamCrest } from "@/features/team/components/TeamCrest"
import { TeamSearchInput } from "@/features/team/components/TeamSearchInput"
import type { TeamResult } from "@/schema/teamSchema"
import { linkWhatsApp } from "@/lib/whatsapp"

export interface ParticipantePartida {
  /**
   * Nome exibido como LADO. Avulso: a pessoa. Competitivo: o CLUBE (o técnico
   * vai em `detalhe`).
   */
  nome: string
  /**
   * Linha secundária sob o nome — no competitivo carrega o técnico
   * ("téc. Fulano" / "vaga aberta"). Avulso não usa.
   */
  detalhe?: string | null
  avatarUrl?: string | null
  /** Celular do destinatário da convocação; normalizado para o link wa.me. */
  celular?: string | null
  /**
   * Mensagem de convocação pré-preenchida do atalho wa.me deste lado
   * (montada no servidor — sauda quem recebe a chamada). Sem ela, chat vazio.
   */
  mensagemWhatsApp?: string
  /**
   * Nome do DESTINATÁRIO da convocação (rótulo "Chamar …"). No competitivo é o
   * técnico (não o clube de `nome`); ausente → usa `nome` (avulso).
   */
  nomeConvocacao?: string | null
  /** Clube que o lado representa (escudo + nome). */
  clube?: { nome: string; escudoUrl?: string | null } | null
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
  /**
   * Se fornecido, habilita escolher/trocar o clube de cada lado (1 ou 2).
   * Sem isso, o clube é apenas exibido (quando presente).
   */
  onSelecionarClube?: (lado: 1 | 2, team: TeamResult) => Promise<void> | void
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
  max = PLACAR_MAX,
}: {
  label: string
  value: number
  onChange: (atualizar: (atual: number) => number) => void
  max?: number
}) {
  const noMinimo = value <= 0
  const noMaximo = value >= max

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
          // Updater funcional: cliques rápidos no mesmo tick acumulam (não lê
          // `value` obsoleto do closure); o clamp protege o piso.
          onChange((atual) => Math.max(0, atual - 1))
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
        aria-disabled={noMaximo}
        className="aria-disabled:opacity-50"
        onClick={() => {
          if (noMaximo) return
          onChange((atual) => Math.min(max, atual + 1))
        }}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}

function ColunaParticipante({
  participante,
  lado,
  value,
  onChange,
  onSelecionarClube,
}: {
  participante: ParticipantePartida
  lado: 1 | 2
  value: number
  onChange: (atualizar: (atual: number) => number) => void
  onSelecionarClube?: (lado: 1 | 2, team: TeamResult) => Promise<void> | void
}) {
  const wa = linkWhatsApp(participante.celular, participante.mensagemWhatsApp)
  const clube = participante.clube
  // No competitivo, "Chamar …" sauda o TÉCNICO (não o clube de `nome`).
  const nomeConvocacao = participante.nomeConvocacao?.trim() || participante.nome

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2">
        <Avatar participante={participante} />
        <span className="text-center text-sm font-medium">
          {participante.nome}
        </span>
        {participante.detalhe ? (
          <span className="text-center text-xs text-muted-foreground">
            {participante.detalhe}
          </span>
        ) : null}
      </div>

      <div className="flex w-full flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <TeamCrest
            nome={clube?.nome ?? participante.nome}
            escudoUrl={clube?.escudoUrl}
            size={28}
          />
          <span className="text-xs text-muted-foreground">
            {clube?.nome ?? "Sem clube"}
          </span>
        </div>
        {onSelecionarClube ? (
          <TeamSearchInput
            className="w-full"
            label={`Clube de ${primeiroNome(participante.nome)}`}
            onSelect={(team) => onSelecionarClube(lado, team)}
          />
        ) : null}
      </div>

      <Stepper label={participante.nome} value={value} onChange={onChange} />

      {wa ? (
        <Button
          asChild
          className="w-full rounded-full bg-green-700 text-white hover:bg-green-800"
        >
          <a href={wa} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" />
            Chamar {primeiroNome(nomeConvocacao)}
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
  onSelecionarClube,
}: MatchScoreModalProps) {
  const [open, setOpen] = React.useState(false)
  const [placar1, setPlacar1] = React.useState(placarInicial1)
  const [placar2, setPlacar2] = React.useState(placarInicial2)
  const [salvando, startSalvar] = React.useTransition()

  // Ressincroniza o estado otimista ao (re)abrir o modal — no handler, sem efeito.
  function handleOpenChange(proximo: boolean) {
    // Não fecha enquanto a Server Action está em voo (evita perder o resultado).
    if (!proximo && salvando) return
    if (proximo) {
      setPlacar1(placarInicial1)
      setPlacar2(placarInicial2)
    }
    setOpen(proximo)
  }

  function handleSalvar() {
    const normalizar = (n: number) => Math.max(0, Math.trunc(n))
    startSalvar(async () => {
      try {
        if (onSave) {
          await onSave({
            matchId,
            placar_1: normalizar(placar1),
            placar_2: normalizar(placar2),
          })
          toast.success("Placar salvo.")
        } else {
          toast.success("Placar salvo (demonstração).")
        }
        setOpen(false)
      } catch (erro) {
        console.error("Falha ao salvar placar", erro)
        toast.error("Não foi possível salvar o placar. Tente novamente.")
      }
    })
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
              lado={1}
              value={placar1}
              onChange={setPlacar1}
              onSelecionarClube={onSelecionarClube}
            />
            <ColunaParticipante
              participante={participante2}
              lado={2}
              value={placar2}
              onChange={setPlacar2}
              onSelecionarClube={onSelecionarClube}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {/* Anuncia o estado em voo a leitores de tela: o botão fica
              `disabled` (sai da árvore de a11y), então o feedback precisa
              vir de uma região live independente. */}
          <span className="sr-only" role="status" aria-live="polite">
            {salvando ? "Salvando placar…" : ""}
          </span>
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
              disabled={salvando}
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
