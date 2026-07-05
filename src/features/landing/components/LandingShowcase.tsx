import { ArrowDown, ArrowUp, Trophy } from "lucide-react"

import { escudoPublicUrl } from "@/lib/escudos"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Vitrine da primeira dobra da landing: dois frames ILUSTRATIVOS (decorativos,
 * `aria-hidden`) que comunicam a profundidade do Goliseu — a mini-pirâmide de
 * divisões (Série A/B, escudos reais, zona de rebaixamento) e o hall da fama de um
 * competidor. Mock CURADO (números realistas hardcoded), não query ao vivo: preserva
 * LCP/CLS e o tema dark/light. Os tokens espelham `StandingsTable` (zonas) e
 * `CompetidorHero`/`HeroChip` (chips). Escudos via `TeamCrest` (`next/image` com
 * dimensão fixa + fallback pro monograma no `onError`). RSC puro.
 */

type Zona = "lider" | "acesso" | "rebaixamento" | undefined

interface LinhaMock {
  pos: number
  nome: string
  id: number
  pontos: number
  zona?: Zona
}

// Série A (elite): campeão + reticências (meio da tabela) + Z4 — dá a sensação de
// uma tabela cheia de 20 times sem listar todas as linhas.
const SERIE_A: LinhaMock[] = [
  { pos: 1, nome: "Flamengo", id: 127, pontos: 68, zona: "lider" },
  { pos: 2, nome: "Palmeiras", id: 121, pontos: 64 },
  { pos: 3, nome: "Cruzeiro", id: 135, pontos: 61 },
  { pos: 18, nome: "Juventude", id: 152, pontos: 34, zona: "rebaixamento" },
  { pos: 19, nome: "Criciúma", id: 140, pontos: 31, zona: "rebaixamento" },
  { pos: 20, nome: "Athletic Club", id: 12257, pontos: 28, zona: "rebaixamento" },
]
// Posição a partir da qual a Série A "salta" para a zona de rebaixamento (linha ⋯).
const CORTE_RETICENCIAS_A = 18

// Série B (acesso): o G4 sobe.
const SERIE_B: LinhaMock[] = [
  { pos: 1, nome: "Santos", id: 128, pontos: 63, zona: "acesso" },
  { pos: 2, nome: "Coritiba", id: 147, pontos: 59, zona: "acesso" },
  { pos: 3, nome: "Goiás", id: 151, pontos: 56, zona: "acesso" },
  { pos: 4, nome: "Novorizontino", id: 7834, pontos: 54, zona: "acesso" },
]

export function LandingShowcase() {
  return (
    <section
      aria-hidden="true"
      className="animate-rise grid w-full gap-4 sm:grid-cols-2"
      style={{ "--stagger": "270ms" } as React.CSSProperties}
    >
      <span className="sr-only">
        Exemplo de pirâmide de divisões (Série A e Série B, com acesso e rebaixamento)
        e o histórico de um competidor
      </span>
      <MiniPiramide />
      <HallDaFama />
    </section>
  )
}

/** Frame 1 — a estrela: divisões de verdade, com sobe/desce. */
function MiniPiramide() {
  return (
    <div className="glow-primary flex flex-col gap-3 rounded-2xl border bg-card/60 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-medium">Pirâmide de divisões</p>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Acesso · queda
        </span>
      </div>

      <DivisaoBloco rotulo="Série A" linhas={SERIE_A} corteReticencias={CORTE_RETICENCIAS_A} />

      {/* Fronteira sobe/desce: a leitura visual (vermelho desce → roxo sobe) já conta
          a história; o conector reforça a direção. */}
      <p className="flex items-center justify-center gap-3 text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1 text-destructive">
          cai <ArrowDown className="size-3" aria-hidden="true" />
        </span>
        <span className="h-3 w-px bg-border" />
        <span className="inline-flex items-center gap-1 text-primary">
          sobe <ArrowUp className="size-3" aria-hidden="true" />
        </span>
      </p>

      <DivisaoBloco rotulo="Série B" linhas={SERIE_B} />

      <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-primary/70" />
          Acesso
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-destructive/70" />
          Rebaixamento
        </li>
      </ul>
    </div>
  )
}

function DivisaoBloco({
  rotulo,
  linhas,
  corteReticencias,
}: {
  rotulo: string
  linhas: LinhaMock[]
  /** Insere a linha "⋯" ANTES da primeira linha cuja `pos` alcança este corte. */
  corteReticencias?: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="font-display text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {rotulo}
      </p>
      <ul className="flex flex-col gap-1">
        {linhas.map((linha, i) => {
          const mostrarReticencias =
            corteReticencias !== undefined &&
            linha.pos >= corteReticencias &&
            (i === 0 || linhas[i - 1].pos < corteReticencias)
          return (
            <li key={linha.pos} className="contents">
              {mostrarReticencias ? (
                <span className="px-3 py-0.5 text-center font-display text-sm font-bold leading-none text-muted-foreground">
                  ⋯
                </span>
              ) : null}
              <LinhaPiramide linha={linha} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function LinhaPiramide({ linha }: { linha: LinhaMock }) {
  const ehLider = linha.zona === "lider"
  const ehAcesso = linha.zona === "acesso"
  const ehRebaixamento = linha.zona === "rebaixamento"

  // Faixa lateral sólida (acesso/queda) — espelha `StandingsTable`.
  const faixa = ehRebaixamento
    ? "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-destructive/70"
    : ehAcesso
      ? "relative overflow-hidden before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary/70"
      : ""
  // Tom de fundo. O ouro do líder tem prioridade; zonas só pintam quando não é líder.
  const tom = ehLider
    ? "bg-gold/12"
    : ehRebaixamento
      ? "bg-destructive/10"
      : ehAcesso
        ? "bg-primary/8"
        : ""

  return (
    <div
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 ${tom} ${faixa}`}
    >
      <span
        className={`inline-flex w-9 shrink-0 items-center gap-1 font-display text-sm font-bold tabular-nums ${
          ehLider ? "text-gold-ink" : "text-muted-foreground"
        }`}
      >
        {ehLider ? <Trophy className="size-3.5" aria-hidden="true" /> : null}
        {linha.pos}º
      </span>
      <TeamCrest nome={linha.nome} escudoUrl={escudoPublicUrl(linha.id)} size={24} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{linha.nome}</span>
      <span className="font-display text-sm font-bold tabular-nums">{linha.pontos}</span>
    </div>
  )
}

/** Frame 2 — o histórico que fica: hall da fama de um competidor. */
function HallDaFama() {
  return (
    <div className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-medium">Hall da fama</p>
        <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Competidor
        </span>
      </div>

      <div className="flex items-center gap-4">
        <TeamCrest
          nome="Flamengo"
          escudoUrl={escudoPublicUrl(127)}
          size={60}
          className="ring-1 ring-foreground/10"
        />
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold tracking-tight">Flamengo</p>
          <p className="text-sm text-muted-foreground">Trajetória na pirâmide</p>
        </div>
      </div>

      <ul className="flex list-none flex-wrap items-center gap-2">
        <li>
          <Chip rotulo="Promédio" valor="2.318" dourado />
        </li>
        <li>
          <Chip rotulo="Temporadas" valor="6" />
        </li>
        <li>
          <Chip rotulo="Títulos" valor="3" dourado Icone={Trophy} />
        </li>
        <li>
          <Chip rotulo="Acessos" valor="4" tom="primary" Icone={ArrowUp} />
        </li>
        <li>
          <Chip rotulo="Queda" valor="1" tom="destructive" Icone={ArrowDown} />
        </li>
      </ul>
    </div>
  )
}

/** Espelha o `HeroChip` do `CompetidorHero` (mesmos tokens de cor). */
function Chip({
  rotulo,
  valor,
  dourado = false,
  tom,
  Icone,
}: {
  rotulo: string
  valor: string
  dourado?: boolean
  tom?: "primary" | "destructive"
  Icone?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>
}) {
  const cor = dourado
    ? "border-gold/30 bg-gold/12 text-gold-ink"
    : tom === "primary"
      ? "border-primary/30 bg-primary/10 text-primary"
      : tom === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/40 text-foreground"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${cor}`}
    >
      {Icone ? <Icone className="size-3.5" aria-hidden={true} /> : null}
      <span className="font-display text-sm font-bold tabular-nums">{valor}</span>
      <span className="text-xs font-medium">{rotulo}</span>
    </span>
  )
}
