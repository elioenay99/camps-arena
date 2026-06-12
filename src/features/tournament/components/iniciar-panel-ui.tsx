import type { LucideIcon } from "lucide-react"

import type { TournamentStatus } from "@/lib/supabase/database.types"
import { StatusPill } from "@/features/tournament/components/StatusPill"

/**
 * Primitivos de apresentação dos painéis "Iniciar torneio" (liga, grupos/fase de
 * liga e mata-mata). SEM "use client": markup puro — usável tanto pela RSC da
 * liga quanto pelas folhas client de grupos/mata-mata. A lógica (motor de prévia,
 * contrato de `name=` com as actions, gates, progressive disclosure) vive nos
 * próprios painéis; aqui só mora a moldura/visual, casando o idioma do
 * `FormatoCard` da criação e do cabeçalho da página do torneio.
 */

/**
 * Card do painel: ícone do formato + título + badge de status + chips de opção.
 * O `id="iniciar-titulo"` é compartilhado pelos 3 formatos de painel — é seguro
 * porque os gates da página (`mostrarIniciar && ehLiga|ehMataMata|ehGrupos`) são
 * mutuamente exclusivos: só um painel monta por vez (ver page.tsx). Não duplicar
 * a moldura na mesma página sem revisar esse contrato.
 */
export function PainelInicioShell({
  Icon,
  formatoLabel,
  qtdClubes,
  chips = [],
  status = "rascunho",
  children,
}: {
  Icon: LucideIcon
  formatoLabel: string
  qtdClubes: number
  /** Chips de opção (ex.: "ida e volta", "3º lugar"). */
  chips?: string[]
  /** Status real do torneio (rascunho; ou ativo no estado de recuperação de grupos). */
  status?: TournamentStatus
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby="iniciar-titulo"
      className="elevate animate-rise flex flex-col gap-4 rounded-2xl border bg-card/60 p-5"
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="bg-primary/10 text-primary ring-primary/20 flex size-11 shrink-0 items-center justify-center rounded-xl ring-1"
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="iniciar-titulo"
              className="font-display text-xl font-bold tracking-tight"
            >
              Iniciar torneio
            </h2>
            <StatusPill status={status} />
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-sm">
            <span>{formatoLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{`${qtdClubes} ${qtdClubes === 1 ? "clube" : "clubes"}`}</span>
            {chips.map((c) => (
              <span
                key={c}
                className="border-border bg-muted/40 rounded-full border px-2 py-0.5 text-xs font-medium"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      </div>
      {children}
    </section>
  )
}

/** Caixa realçada da prévia da geração (o que a action vai criar). */
export function PreviaBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-primary/20 bg-primary/5 rounded-xl border px-4 py-3">
      <p className="text-sm">{children}</p>
    </div>
  )
}

/**
 * Cartão selecionável de modo (sorteio/potes/manual). Mesmo idioma do
 * `FormatoCard`: `<label>` envolvendo um radio `sr-only` (o contrato de
 * `name="modo"` e a associação acessível ficam intactos — `getByLabelText`
 * resolve pelo texto do label). `flex-1` para dividir a linha igualmente.
 *
 * No estado desabilitado a borda vira tracejada e o cursor `not-allowed`, mas a
 * DESCRIÇÃO permanece em contraste pleno (ela explica POR QUE está desabilitado —
 * ex.: "Exige 4, 8, 16, 32 clubes"; um `opacity` no label inteiro a derrubaria
 * abaixo do AA).
 */
export function ModoCard({
  name,
  value,
  checked,
  onChange,
  disabled = false,
  Icon,
  titulo,
  descricao,
}: {
  name: string
  value: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  Icon: LucideIcon
  titulo: string
  descricao: string
}) {
  return (
    <label
      className={`has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-background relative flex flex-1 flex-col gap-2 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 ${
        disabled
          ? "border-dashed cursor-not-allowed"
          : checked
            ? "border-primary bg-primary/8 ring-primary/40 cursor-pointer ring-1"
            : "border-border hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={`flex size-9 items-center justify-center rounded-lg transition-colors ${
          checked && !disabled
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span
          className={`text-sm leading-none font-medium ${disabled ? "text-muted-foreground" : ""}`}
        >
          {titulo}
        </span>
        <span className="text-muted-foreground text-xs">{descricao}</span>
      </span>
    </label>
  )
}
