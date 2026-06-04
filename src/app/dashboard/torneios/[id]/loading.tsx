import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carregamento da página de classificação. Sem ele, o boundary
 * herdado de /dashboard mostraria skeletons de PARTIDAS (geometria e copy de
 * outra tela). Espelha header + tabela para evitar layout shift.
 */
export default function TorneioLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10"
    >
      <span className="sr-only">Carregando classificação…</span>

      {/* Sem marca: o header persistente do layout do segmento já a exibe. */}
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </main>
  );
}
