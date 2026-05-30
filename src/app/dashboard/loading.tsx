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
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-16"
    >
      <span className="sr-only">Carregando partidas ativas…</span>

      <div className="flex items-center justify-between" aria-hidden="true">
        <span className="text-sm font-semibold tracking-[0.3em] text-muted-foreground">
          ARENA
        </span>
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>

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
