"use client"

import * as React from "react"
import { Minus, Plus, MessageCircle, X, ChevronDown } from "lucide-react"
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
  /**
   * Discriminador competitivo × avulso (zero-DDL, setado no mapeamento). Governa
   * a identidade do lado no scoreboard: `true` → escudo do CLUBE (`TeamCrest`);
   * `false`/ausente → FOTO da pessoa. NUNCA usar `clube` truthiness para isso —
   * o avulso pode ter um clube COSMÉTICO e ainda assim ser identidade-pessoa.
   */
  ehCompetitivo?: boolean
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
   * Config SERIALIZÁVEL do gatilho padrão (rótulo/aria/classe). PREFERIR isto a
   * `trigger` quando o modal é montado por um SERVER component: passar um JSX de
   * client-component (`<Button>`) pela fronteira RSC pode chegar CORROMPIDO
   * (deixa de ser React element válido — `React.isValidElement` = false) e o
   * `DialogTrigger asChild` renderiza NADA, sem erro. Com strings, o gatilho é
   * construído AQUI, no cliente, e sempre aparece.
   */
  triggerLabel?: string
  triggerAriaLabel?: string
  triggerClassName?: string
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

/**
 * O lado renderiza um botão "Chamar" na seção abaixo do scoreboard? Espelha a
 * guarda interna de `SecaoLado`: só quando é convocável E há link wa.me válido
 * — sem isso, o wrapper montaria um divisor `border-t` vazio.
 */
function temChamada(p: ParticipantePartida) {
  return p.convocavel === true && linkWhatsApp(p.celular, p.mensagemWhatsApp) !== null
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

/** Foto da PESSOA (avulso), com fallback de iniciais. Decorativa — o nome
 * acompanha em texto na `IdentidadeLado`. */
function FotoPessoa({
  participante,
  size = 40,
}: {
  participante: ParticipantePartida
  size?: number
}) {
  const [erro, setErro] = React.useState(false)
  const mostrarImagem = Boolean(participante.avatarUrl) && !erro

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.35)),
      }}
    >
      {mostrarImagem ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={participante.avatarUrl ?? undefined}
          alt=""
          className="size-full object-cover"
          onError={() => setErro(true)}
        />
      ) : (
        <span>{iniciais(participante.nome)}</span>
      )}
    </span>
  )
}

/**
 * UMA identidade por lado (sem duplicação): escudo ~40px (competitivo) ou foto
 * da pessoa (avulso) + nome UMA vez (truncado) + `detalhe` (técnico). Ramifica
 * por `ehCompetitivo` (NUNCA por `clube` truthiness — o avulso pode ter clube
 * cosmético). O clube cosmético do avulso reaparece na seção abaixo do
 * scoreboard, não aqui.
 */
function IdentidadeLado({
  participante,
  size = 40,
}: {
  participante: ParticipantePartida
  size?: number
}) {
  return (
    // `w-full`: a coluna do scoreboard é `flex items-center` (não estica o
    // filho no eixo cruzado), então sem isto a raiz teria a largura do CONTEÚDO
    // e o `truncate` do nome não constringiria (nome longo vazaria a 360px).
    <div className="flex w-full min-w-0 flex-col items-center gap-1.5">
      {participante.ehCompetitivo ? (
        <TeamCrest
          nome={participante.clube?.nome ?? participante.nome}
          escudoUrl={participante.clube?.escudoUrl}
          size={size}
        />
      ) : (
        <FotoPessoa participante={participante} size={size} />
      )}
      <span className="w-full truncate text-center text-sm font-medium">
        {participante.nome}
      </span>
      {participante.detalhe ? (
        <span className="w-full truncate text-center text-xs text-muted-foreground">
          {participante.detalhe}
        </span>
      ) : null}
    </div>
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
    // Compacto para caber 2-up a 360px: gap-1, botões 40px, número sem largura
    // fixa (só min-w-6). Conta min-content ≈ 88 + número ≤ ~116px @360.
    <div className="flex items-center justify-center gap-1">
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
        className="font-display min-w-6 text-center text-2xl font-bold tabular-nums sm:text-3xl"
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

/**
 * Seção de largura total ABAIXO do scoreboard, para UM lado: o botão "Chamar"
 * (só do lado convocável) e — no avulso (`onSelecionarClube`) — o clube
 * cosmético atual + a busca de clube. Fica FORA das colunas do placar para que
 * elas permaneçam simétricas e curtas; o clube do avulso não some, só migra.
 * Renderiza nada quando o lado não tem nem convocação nem seleção de clube.
 */
function SecaoLado({
  participante,
  lado,
  onSelecionarClube,
}: {
  participante: ParticipantePartida
  lado: 1 | 2
  onSelecionarClube?: (lado: 1 | 2, team: TeamResult) => Promise<void> | void
}) {
  // Só o lado convocável (o adversário) ganha link — nunca o próprio usuário.
  const wa = participante.convocavel
    ? linkWhatsApp(participante.celular, participante.mensagemWhatsApp)
    : null
  const clube = participante.clube
  // No competitivo, "Chamar …" sauda o TÉCNICO (não o clube de `nome`).
  const nomeConvocacao = participante.nomeConvocacao?.trim() || participante.nome

  if (!wa && !onSelecionarClube) return null

  return (
    <div className="flex flex-col gap-2">
      {onSelecionarClube ? (
        <div className="flex w-full flex-col gap-2">
          <div className="flex items-center gap-2">
            <TeamCrest
              nome={clube?.nome ?? participante.nome}
              escudoUrl={clube?.escudoUrl}
              size={24}
            />
            <span className="text-xs text-muted-foreground">
              {clube?.nome ?? "Sem clube"}
            </span>
          </div>
          <TeamSearchInput
            className="w-full"
            label={`Clube de ${primeiroNome(participante.nome)}`}
            onSelect={(team) => onSelecionarClube(lado, team)}
          />
        </div>
      ) : null}

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
                    className="border-input bg-background h-11 min-w-0 flex-1 rounded-md border px-3 text-base md:h-9 md:text-sm"
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
  triggerLabel,
  triggerAriaLabel,
  triggerClassName,
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

  // Há autores JÁ GRAVADOS no preload editável (superfícies REPLACE)? Se sim, a
  // seção de autores começa ABERTA — senão o organizador não veria o que editar.
  const temPreload = React.useMemo(
    () =>
      [...preloadDoLado(1), ...preloadDoLado(2)].some(
        (l) => l.jogador.trim() !== "" || l.contra || l.gols > 0
      ),
    [preloadDoLado]
  )

  // Abertura CONTROLADA por estado (NÃO `open={temPreload}` cru — reafirmaria
  // `open=true` a cada re-render do Stepper e reabriria sozinha). O `<details>`
  // só oculta via CSS; os autores no pai (`autores1/2`) PERSISTEM.
  const [autoresAbertos, setAutoresAbertos] = React.useState(() => temPreload)

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
      // Ressincroniza a visibilidade: reabre se há autores gravados, recolhe
      // no caso comum. (O toggle do usuário durante a sessão vale enquanto aberto.)
      setAutoresAbertos(temPreload)
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {/* `trigger` (JSX) só é usado se chegou como React element VÁLIDO. Vindo
            de um server component pela fronteira RSC ele pode corromper — nesse
            caso (ou quando ausente) o gatilho é construído a partir das strings
            triggerLabel/triggerAriaLabel/triggerClassName, no cliente. */}
        {React.isValidElement(trigger) ? (
          trigger
        ) : (
          <Button
            type="button"
            variant="secondary"
            className={triggerClassName ?? "min-h-11 px-4"}
            aria-label={triggerAriaLabel}
          >
            {triggerLabel ?? "Menu da Partida"}
          </Button>
        )}
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
            {/* Placar 2-up já na base (mobile): "A × B". `minmax(0,1fr)` nas
                trilhas (não `1fr`, cujo mínimo é o conteúdo → não encolheria e
                o nome longo vazaria) + `min-w-0` nas colunas para o `truncate`
                do nome funcionar. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-1">
              <div className="flex min-w-0 flex-col items-center gap-2">
                <IdentidadeLado participante={participante1} />
                <Stepper
                  label={participante1.nome}
                  value={placar1}
                  onChange={setPlacar1}
                />
              </div>
              <span
                className="text-muted-foreground self-center text-lg"
                aria-hidden="true"
              >
                ×
              </span>
              <div className="flex min-w-0 flex-col items-center gap-2">
                <IdentidadeLado participante={participante2} />
                <Stepper
                  label={participante2.nome}
                  value={placar2}
                  onChange={setPlacar2}
                />
              </div>
            </div>

            {/* "Chamar" e a busca de clube saem das colunas → seção de largura
                total, mantendo o placar simétrico e curto. */}
            {onSelecionarClube ||
            temChamada(participante1) ||
            temChamada(participante2) ? (
              <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                <SecaoLado
                  participante={participante1}
                  lado={1}
                  onSelecionarClube={onSelecionarClube}
                />
                <SecaoLado
                  participante={participante2}
                  lado={2}
                  onSelecionarClube={onSelecionarClube}
                />
              </div>
            ) : null}
          </div>

          {mostrarAutores ? (
            <details
              open={autoresAbertos}
              onToggle={(e) => setAutoresAbertos(e.currentTarget.open)}
              className="elevate group rounded-2xl border bg-card/60"
            >
              {/* Recolhido no caso comum (aberto quando há autores gravados). O
                  texto EXATO fica em nó próprio; o chevron é ícone decorativo. */}
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                  Autores dos gols (opcional)
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="flex flex-col gap-4 px-4 pb-4">
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
            </details>
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

        <DialogFooter className="flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-col sm:space-x-0">
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
  )
}
