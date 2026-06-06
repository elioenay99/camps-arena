"use client";

// Error boundaries DEVEM ser Client Components (convenção Next). Sem este
// arquivo, o boundary herdado de /dashboard/torneios/[id] exibiria "Não foi
// possível carregar a classificação do torneio" — copy de outra tela.
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <Card role="alert" className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Algo deu errado</CardTitle>
          <CardDescription>
            Não foi possível carregar o formulário de nova partida. Tente
            novamente em instantes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          <p>Se o problema persistir, recarregue a página ou volte mais tarde.</p>
          <div>
            <Button type="button" onClick={() => tentarNovamente()}>
              Tentar novamente
            </Button>
          </div>
          {error.digest ? (
            <p className="text-xs text-muted-foreground/70">
              Código do erro: {error.digest}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
