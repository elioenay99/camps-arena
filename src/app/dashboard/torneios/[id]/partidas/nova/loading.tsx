import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback de carregamento do form de nova partida. Sem ele, o boundary
 * herdado de /dashboard/torneios/[id] mostraria skeleton de TABELA de
 * classificação (geometria e copy de outra tela). Espelha o Card do form.
 */
export default function NovaPartidaDoTorneioLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="flex flex-1 items-center justify-center px-6 py-10"
    >
      <span className="sr-only">Carregando nova partida…</span>

      <div className="w-full max-w-sm" aria-hidden="true">
        <div className="flex flex-col gap-4 rounded-xl border p-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </div>
    </main>
  );
}
