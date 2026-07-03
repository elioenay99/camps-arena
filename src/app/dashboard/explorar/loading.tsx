import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carregamento da vitrine. Sem ele, o boundary herdado de /dashboard
 * mostraria skeletons de PARTIDAS (geometria/copy de outra tela). Espelha header
 * + lista de cards para evitar layout shift.
 */
export default function ExplorarLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">Carregando a vitrine…</span>

      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </main>
  );
}
