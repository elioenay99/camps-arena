import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carregamento do índice de torneios. Sem ele, o boundary herdado
 * de /dashboard mostraria skeletons de PARTIDAS (geometria e copy de outra
 * tela). Espelha header + listas para evitar layout shift.
 */
export default function TorneiosLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">Carregando torneios…</span>

      {/* Sem marca: o header persistente do layout do segmento já a exibe. */}
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </main>
  );
}
