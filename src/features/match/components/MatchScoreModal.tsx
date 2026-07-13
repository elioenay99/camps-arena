"use client"

import * as React from "react"
import { Minus, Plus, MessageCircle, X } from "lucide-react"
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
import { PLACAR_MAX, type AutorGolInput } from "@/schema/matchSchema"
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
  /**
   * Este lado pode ser CONVOCADO pelo usuário logado (é o adversário dele).
   * O botão "Chamar …" só aparece quando `true` — assim o usuário nunca vê o
   * atalho na PRÓPRIA coluna (sem auto-chamada). Decidido no servidor (quem é
   * o adversário); ausente/false → sem botão.
   */
  convocavel?: boolean
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
    /** Autores dos gols (opcional). `undefined` = não mexe nos autores atuais. */
    autores?: AutorGolInput[]
  }) => Promise<void> | void
  /**
   * Slot (vaga) de cada lado no competitivo — chave para o autocomplete de
   * autores de gol (`carregarSugestoes`). null/ausente (avulso ou bye) esconde a
   * captura de autores daquele lado.
   */
  vagaId1?: string | null
  vagaId2?: string | null
  /**
   * Busca sob demanda os nomes já usados por AQUELE competidor (via a vaga), para
   * o autocomplete dos autores de gol. Injetado pelo wrapper conectado; lazy (só
   * ao abrir o modal). Degrada em silêncio (`[]`) em qualquer falha.
   */
  carregarSugestoes?: (vagaId: string) => Promise<string[]>
  /**
   * Preload EDITÁVEL dos autores já gravados (superfícies REPLACE: lançamento
   * direto do organizador e console do organizador). Agrupado por lado E por
   * `contra`. A captura abre com essas linhas — reabrir + re-lançar SEM tocar
   * preserva (o writer é delete-then-insert por-lado). NÃO usar na superfície
   * APPEND ("Meus artilheiros"), que reenviaria o preload e DOBRARIA na RPC.
   */
  autoresIniciais?: AutorInicial[]
  /**
   * Se fornecido, habilita escolher/trocar o clube de cada lado (1 ou 2).
   * Sem isso, o clube é apenas exibido (quando presente).
   */
  onSelecionarClube?: (lado: 1 | 2, team: TeamResult) => Promise<void> | void
  /**
   * Modo do placar (change add-proposta-resultado-foto): `direto` grava na hora
   * (avulso ou aprovador); `proposta` ENVIA para aprovação com FOTO obrigatória
   * (técnico no competitivo). Default `direto`.
   */
  modoPlacar?: "direto" | "proposta"
  /** Envio da proposta (modo `proposta`): placares normalizados + a foto. */
  onEnviarProposta?: (input: {
    matchId: string
    placar_1: number
    placar_2: number
    foto: File
    /** Autores dos gols (opcional). `undefined` = não envia autores. */
    autores?: AutorGolInput[]
  }) => Promise<void> | void
}

/** Linha da captura de autores por lado (nome livre + contagem de gols + contra). */
interface AutorLinha {
  jogador: string
  gols: number
  /** Gol contra: conta pro placar do lado, FORA do ranking; nome opcional. */
  contra: boolean
}

/** Autor pré-carregado (preload editável das superfícies REPLACE). */
export interface AutorInicial {
  lado: 1 | 2
  jogador: string | null
  gols: number
  contra: boolean
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
    <div className="flex items-center justify-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={`Diminuir placar de ${label}`}
        aria-disabled={noMinimo}
        className="size-10 aria-disabled:opacity-50"
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
        className="font-display min-w-12 text-center text-4xl font-bold tabular-nums"
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
        className="size-10 aria-disabled:opacity-50"
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
  // Só o lado convocável (o adversário) ganha link — nunca a coluna do próprio
  // usuário (sem auto-chamada).
  const wa = participante.convocavel
    ? linkWhatsApp(participante.celular, participante.mensagemWhatsApp)
    : null
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

/**
 * Captura opcional dos autores de gol de UM lado: lista de linhas `{nome, gols}`
 * com autocomplete (`<datalist>`) dos nomes já usados por aquele competidor. A
 * soma por lado deve ficar ≤ placar do lado (aviso suave; o backend/Zod também
 * rejeita). Toque ≥44px nos controles (mobile-first).
 */
function AutoresLado({
  lado,
  nomeLado,
  placar,
  sugestoes,
  autores,
  onChange,
}: {
  lado: 1 | 2
  nomeLado: string
  placar: number
  sugestoes: string[]
  autores: AutorLinha[]
  onChange: (proximo: AutorLinha[]) => void
}) {
  const listId = `sugestoes-autor-lado-${lado}`
  const soma = autores.reduce((acc, a) => acc + (a.gols || 0), 0)
  const excede = soma > placar

  const atualizarLinha = (i: number, patch: Partial<AutorLinha>) =>
    onChange(autores.map((a, idx) => (idx === i ? { ...a, ...patch } : a)))
  const removerLinha = (i: number) =>
    onChange(autores.filter((_, idx) => idx !== i))
  const adicionar = () =>
    onChange([...autores, { jogador: "", gols: 1, contra: false }])

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

      {autores.length > 0 ? (
        <ul className="flex list-none flex-col gap-2 p-0">
          {autores.map((linha, i) => {
            const rotulo =
              linha.jogador.trim() || (linha.contra ? "gol contra" : `autor ${i + 1}`)
            return (
              <li key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    list={linha.contra ? undefined : listId}
                    value={linha.jogador}
                    onChange={(e) => atualizarLinha(i, { jogador: e.target.value })}
                    placeholder={
                      linha.contra ? "Gol contra (nome opcional)" : "Nome do autor"
                    }
                    aria-label={`Autor ${i + 1} de ${nomeLado}`}
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
                      onClick={() =>
                        linha.gols > 1 && atualizarLinha(i, { gols: linha.gols - 1 })
                      }
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                    <span
                      className="min-w-6 text-center text-sm font-semibold tabular-nums"
                      aria-hidden="true"
                    >
                      {linha.gols}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={`Aumentar gols de ${rotulo}`}
                      aria-disabled={linha.gols >= 99}
                      className="size-11 aria-disabled:opacity-50 md:size-9"
                      onClick={() =>
                        linha.gols < 99 && atualizarLinha(i, { gols: linha.gols + 1 })
                      }
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
                    onClick={() => removerLinha(i)}
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

      <datalist id={listId}>
        {sugestoes.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={adicionar}
        className="min-h-9 self-start rounded-full"
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
  modoPlacar = "direto",
  onEnviarProposta,
  vagaId1,
  vagaId2,
  carregarSugestoes,
  autoresIniciais,
}: MatchScoreModalProps) {
  const [open, setOpen] = React.useState(false)
  const [placar1, setPlacar1] = React.useState(placarInicial1)
  const [placar2, setPlacar2] = React.useState(placarInicial2)
  const [foto, setFoto] = React.useState<File | null>(null)
  const [autores1, setAutores1] = React.useState<AutorLinha[]>([])
  const [autores2, setAutores2] = React.useState<AutorLinha[]>([])
  // Só envia `autores` quando o usuário mexeu na captura — sem isso, `undefined`
  // preserva os autores já gravados (a action não toca match_goals).
  const [autoresTocado, setAutoresTocado] = React.useState(false)
  const [sugestoes1, setSugestoes1] = React.useState<string[]>([])
  const [sugestoes2, setSugestoes2] = React.useState<string[]>([])
  const [salvando, startSalvar] = React.useTransition()
  const ehProposta = modoPlacar === "proposta"
  // Captura de autores só no competitivo (lado com vaga/competidor persistente):
  // no avulso o gol não entra em ranking/carreira, então não há o que capturar.
  const mostrarAutores1 = Boolean(vagaId1)
  const mostrarAutores2 = Boolean(vagaId2)
  const mostrarAutores = mostrarAutores1 || mostrarAutores2

  // Autocomplete: carrega os nomes já usados por cada competidor ao ABRIR (lazy).
  // Degrada em silêncio — o autocomplete é auxiliar, nunca bloqueia o lançamento.
  React.useEffect(() => {
    if (!open || !carregarSugestoes) return
    let vivo = true
    if (vagaId1) {
      carregarSugestoes(vagaId1)
        .then((s) => vivo && setSugestoes1(s))
        .catch(() => {})
    }
    if (vagaId2) {
      carregarSugestoes(vagaId2)
        .then((s) => vivo && setSugestoes2(s))
        .catch(() => {})
    }
    return () => {
      vivo = false
    }
  }, [open, carregarSugestoes, vagaId1, vagaId2])

  const atualizarAutores = (lado: 1 | 2, proximo: AutorLinha[]) => {
    setAutoresTocado(true)
    if (lado === 1) setAutores1(proximo)
    else setAutores2(proximo)
  }

  // Preload editável (superfícies REPLACE): as linhas já gravadas de um lado,
  // preservando `contra` e a grafia. O anônimo (jogador null) vira "".
  const preloadDoLado = React.useCallback(
    (lado: 1 | 2): AutorLinha[] =>
      (autoresIniciais ?? [])
        .filter((a) => a.lado === lado)
        .map((a) => ({ jogador: a.jogador ?? "", gols: a.gols, contra: a.contra })),
    [autoresIniciais]
  )

  // Ressincroniza o estado otimista ao (re)abrir o modal — no handler, sem efeito.
  function handleOpenChange(proximo: boolean) {
    // Não fecha enquanto a Server Action está em voo (evita perder o resultado).
    if (!proximo && salvando) return
    if (proximo) {
      setPlacar1(placarInicial1)
      setPlacar2(placarInicial2)
      setFoto(null)
      // Preload editável: a captura reflete o estado atual (nunca abre vazia
      // sobre gols gravados). `autoresTocado=false` → `undefined` no save
      // (preserva); tocar governa a lista COMPLETA daquele lado.
      setAutores1(preloadDoLado(1))
      setAutores2(preloadDoLado(2))
      setAutoresTocado(false)
    }
    setOpen(proximo)
  }

  function handleConfirmar() {
    const normalizar = (n: number) => Math.max(0, Math.trunc(n))
    const p1 = normalizar(placar1)
    const p2 = normalizar(placar2)
    if (ehProposta && !foto) {
      toast.error("Anexe uma foto de evidência do placar.")
      return
    }
    // Monta os autores só quando a captura foi tocada; nomes vazios são
    // descartados. `undefined` (não tocado) = preserva os autores atuais.
    let autores: AutorGolInput[] | undefined
    if (autoresTocado) {
      const combinado: AutorGolInput[] = [
        ...autores1.map((a) => ({
          lado: 1 as const,
          jogador: a.jogador.trim(),
          gols: a.gols,
          contra: a.contra,
        })),
        ...autores2.map((a) => ({
          lado: 2 as const,
          jogador: a.jogador.trim(),
          gols: a.gols,
          contra: a.contra,
        })),
        // Gol normal precisa de nome; o gol contra pode ser anônimo (mantido).
      ].filter((a) => a.contra || a.jogador !== "")
      // Aviso duro (o inline já mostra o excesso): a soma por lado não pode passar
      // do placar — o backend/Zod rejeitaria com a mesma regra.
      const soma1 = combinado.filter((a) => a.lado === 1).reduce((s, a) => s + a.gols, 0)
      const soma2 = combinado.filter((a) => a.lado === 2).reduce((s, a) => s + a.gols, 0)
      if (soma1 > p1 || soma2 > p2) {
        toast.error("Os autores somam mais gols que o placar. Ajuste antes de salvar.")
        return
      }
      autores = combinado
    }
    startSalvar(async () => {
      try {
        if (ehProposta) {
          if (onEnviarProposta && foto) {
            await onEnviarProposta({
              matchId,
              placar_1: p1,
              placar_2: p2,
              foto,
              autores,
            })
            toast.success("Placar enviado para aprovação.")
          }
        } else if (onSave) {
          await onSave({
            matchId,
            placar_1: p1,
            placar_2: p2,
            autores,
          })
          toast.success("Placar salvo.")
        } else {
          toast.success("Placar salvo (demonstração).")
        }
        setOpen(false)
      } catch (erro) {
        console.error("Falha ao confirmar placar", erro)
        const fallback = ehProposta
          ? "Não foi possível enviar o placar. Tente novamente."
          : "Não foi possível salvar o placar. Tente novamente."
        toast.error(erro instanceof Error && erro.message ? erro.message : fallback)
      }
    })
  }

  if (typeof window !== "undefined") {
    const w = window as unknown as { __DBGWO2?: unknown[] }
    ;(w.__DBGWO2 ||= []).push({
      id: matchId,
      valid: React.isValidElement(trigger),
      type:
        trigger == null
          ? "nil"
          : Array.isArray(trigger)
            ? "arr"
            : typeof trigger,
    })
  }
  return (
    <>
      <span data-dbgwo-modal={matchId} hidden />
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
          <DialogTitle className="font-display text-center text-xl font-bold tracking-tight">
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

        {/* Miolo rolável: o header e o footer (enviar/fechar) ficam FORA, então
            nunca somem num modal alto ou com o teclado virtual aberto. */}
        <DialogBody className="flex flex-col gap-4">
          <div className="elevate rounded-2xl border bg-card/60 p-4">
            <p className="mb-4 text-center text-xs font-semibold tracking-wide uppercase text-muted-foreground">
              {ehProposta ? "Enviar placar para aprovação" : "Lançar placar"}
            </p>
            {/* Empilha os lados em 360-390px; lado a lado no sm+. */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

          {mostrarAutores ? (
            <div className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-4">
              <p className="text-center text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                Autores dos gols (opcional)
              </p>
              {mostrarAutores1 ? (
                <AutoresLado
                  lado={1}
                  nomeLado={participante1.nome}
                  placar={placar1}
                  sugestoes={sugestoes1}
                  autores={autores1}
                  onChange={(proximo) => atualizarAutores(1, proximo)}
                />
              ) : null}
              {mostrarAutores2 ? (
                <AutoresLado
                  lado={2}
                  nomeLado={participante2.nome}
                  placar={placar2}
                  sugestoes={sugestoes2}
                  autores={autores2}
                  onChange={(proximo) => atualizarAutores(2, proximo)}
                />
              ) : null}
            </div>
          ) : null}

          {ehProposta ? (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="foto-evidencia"
                className="text-xs font-medium text-muted-foreground"
              >
                Foto de evidência (obrigatória)
              </label>
              <input
                id="foto-evidencia"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
              />
              {foto ? (
                <span className="truncate text-xs text-muted-foreground">{foto.name}</span>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          {/* Anuncia o estado em voo a leitores de tela: o botão fica
              `disabled` (sai da árvore de a11y), então o feedback precisa
              vir de uma região live independente. */}
          <span className="sr-only" role="status" aria-live="polite">
            {salvando ? (ehProposta ? "Enviando placar…" : "Salvando placar…") : ""}
          </span>
          <Button
            type="button"
            size="lg"
            onClick={handleConfirmar}
            disabled={salvando || (ehProposta && !foto)}
            className="w-full rounded-full"
          >
            {salvando
              ? ehProposta
                ? "Enviando…"
                : "Salvando…"
              : ehProposta
                ? "Enviar para aprovação"
                : "Salvar placar"}
          </Button>
          <DialogClose asChild>
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              className="w-full rounded-full"
            >
              Fechar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
