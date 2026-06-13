import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto da `StandingsTable` — espelha a MESMA caixa de overflow
 * (`overflow-x-auto rounded-lg border` + piso `min-w-[34rem]`) e a geometria de
 * 10 colunas (posição + nome largo com avatar + 8 estatísticas) para eliminar o
 * layout shift horizontal no 390px. Decorativo (`aria-hidden`): a região de
 * carregamento (`role="status"` + `sr-only`) fica no `loading.tsx`.
 */
export function StandingsTableSkeleton({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border" aria-hidden="true">
      {/* Mesmo piso da tabela real (StandingsTable.tsx): sem ele o esqueleto
          sairia mais estreito que o conteúdo e o shift voltaria. */}
      <div className="min-w-[34rem]">
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2.5">
          <Skeleton className="h-3 w-7" />
          <Skeleton className="h-3 w-24" />
          <div className="ml-auto flex items-center gap-3.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-3.5" />
            ))}
          </div>
        </div>
        {Array.from({ length: linhas }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b px-3 py-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-5" />
            <span className="flex items-center gap-2">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </span>
            <div className="ml-auto flex items-center gap-3.5">
              {Array.from({ length: 8 }).map((_, j) => (
                <Skeleton key={j} className="h-4 w-3.5" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
