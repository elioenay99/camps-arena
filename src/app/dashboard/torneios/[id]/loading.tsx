import { Skeleton } from "@/components/ui/skeleton";
import { StandingsTableSkeleton } from "@/features/standings/components/StandingsTableSkeleton";

/**
 * Fallback de carregamento da página do torneio. Espelha a geometria REAL
 * (cabeçalho-hero `.elevate` + cabeçalho de seção + tabela de classificação)
 * para reduzir layout shift. O boundary é anterior à busca (não conhece o
 * formato), então representa o caso dominante — a classificação por tabela; o
 * conteúdo real (tabela, chave ou grupos) substitui o esqueleto ao carregar.
 */
export default function TorneioLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">Carregando classificação…</span>

      {/* Cabeçalho-hero espelhado (chip de ícone + título + chips). */}
      <div
        aria-hidden="true"
        className="elevate flex flex-col gap-4 rounded-2xl border bg-card/60 p-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex items-start gap-3.5">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-7 w-44 sm:w-56" />
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Seção de classificação (cabeçalho iconado + tabela). */}
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-4.5 rounded" />
          <Skeleton className="h-6 w-40" />
        </div>
        <StandingsTableSkeleton />
      </div>
    </main>
  );
}
