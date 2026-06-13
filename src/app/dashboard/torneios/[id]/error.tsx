"use client";

// Error boundaries DEVEM ser Client Components (convenção Next). Sem este
// arquivo, o boundary herdado de /dashboard exibiria "Não foi possível
// carregar as partidas ativas" — copy de outra tela.
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";

import { BoundaryCard } from "@/components/boundary-card";
import { BoundaryRetryActions } from "@/components/boundary-retry-actions";

export default function TorneioError({
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      {/* Sem marca: o header persistente do layout do segmento já a exibe. */}
      <BoundaryCard
        role="alert"
        tone="erro"
        Icon={TriangleAlert}
        titulo="Algo deu errado"
        descricao="Não foi possível carregar a classificação do torneio. Tente novamente em instantes."
      >
        <BoundaryRetryActions onRetry={tentarNovamente} digest={error.digest} />
      </BoundaryCard>
    </main>
  );
}
