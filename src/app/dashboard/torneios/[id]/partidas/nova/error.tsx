"use client";

// Error boundaries DEVEM ser Client Components (convenção Next). Sem este
// arquivo, o boundary herdado de /dashboard/torneios/[id] exibiria "Não foi
// possível carregar a classificação do torneio" — copy de outra tela.
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { BoundaryCard } from "@/components/boundary-card";
import { BoundaryRetryActions } from "@/components/boundary-retry-actions";

export default function NovaPartidaDoTorneioError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  // Preferido no Next 16.2+ (re-busca + re-renderiza); reset() é o fallback.
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    // Log só no servidor/console — nunca exibimos detalhes ao usuário.
    console.error(error);
  }, [error]);

  const tentarNovamente = unstable_retry ?? reset;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-10">
      <BoundaryCard
        role="alert"
        tone="erro"
        Icon={TriangleAlert}
        className="w-full max-w-sm"
        titulo="Algo deu errado"
        descricao="Não foi possível carregar o formulário de nova partida. Tente novamente em instantes."
      >
        <BoundaryRetryActions onRetry={tentarNovamente} digest={error.digest} />
      </BoundaryCard>
    </main>
  );
}
