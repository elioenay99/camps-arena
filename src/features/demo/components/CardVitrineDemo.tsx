"use client"

import { Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ChampionshipBadge } from "@/features/championship/components/ChampionshipBadge"
import { StatusPill } from "@/features/tournament/components/StatusPill"
import { FORMATO_META } from "@/features/tournament/formatoMeta"
import type { ItemVitrineDemo } from "@/features/demo/store/tipos"

// Reimplementa o CardVitrine/VitrineVazia (inline e não exportados em
// explorar/page.tsx de produção) no namespace demo — sem refatorar produção.

export function CardVitrineDemo({
  item,
  onToggleListar,
}: {
  item: ItemVitrineDemo
  // Ausente quando o perfil fictício não pode gerir: o card fica read-only
  // (sem o toggle "listar"), espelhando o gate de UI do produto.
  onToggleListar?: () => void
}) {
  const meta = FORMATO_META[item.formato]
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/60 px-3 py-2.5">
      <ChampionshipBadge
        icon={<meta.Icon className="size-4" />}
        primary={item.corPrimaria}
        secondary={item.corSecundaria}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.nome}</span>
        <span className="text-xs text-muted-foreground">
          {item.tipo === "liga" ? "Pirâmide" : "Torneio"} · {meta.label} ·{" "}
          {item.competidores} competidores
        </span>
      </div>
      <StatusPill status={item.status} />
      {onToggleListar ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleListar}
          aria-pressed={item.listado}
          aria-label={item.listado ? `Remover ${item.nome} da vitrine` : `Listar ${item.nome} na vitrine`}
        >
          {item.listado ? (
            <>
              <Eye aria-hidden className="size-3.5" /> Listada
            </>
          ) : (
            <>
              <EyeOff aria-hidden className="size-3.5" /> Não listada
            </>
          )}
        </Button>
      ) : null}
    </li>
  )
}

export function VitrineVaziaDemo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
      {children ?? "Nenhuma competição na vitrine com esses critérios."}
    </div>
  )
}
