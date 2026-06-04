import { Skeleton } from "@/components/ui/skeleton";
import { MatchCardSkeleton } from "@/features/match/components/MatchCardSkeleton";

/**
 * Fallback de carregamento do segmento /dashboard. O Next envolve a page num
 * <Suspense>; como a page suspende no `await getActiveMatches()`, este
 * esqueleto aparece. Espelha a geometria do page.tsx para evitar layout shift.
 */
export default function DashboardLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">Carregando partidas ativas…</span>

      {/* Sem marca aqui: o boundary renderiza DENTRO do layout do segmento,
          que já mostra o header persistente. */}
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-8 w-48" />
        <ul className="flex list-none flex-col gap-4 p-0">
          <MatchCardSkeleton />
          <MatchCardSkeleton />
          <MatchCardSkeleton />
        </ul>
      </div>
    </main>
  );
}
