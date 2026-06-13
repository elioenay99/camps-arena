import { Button } from "@/components/ui/button"

/**
 * Corpo compartilhado dos error boundaries: dica de persistência + botão de
 * retry + código do erro (`digest`). Extraído para os quatro `error.tsx`
 * pararem de duplicar este bloco byte-a-byte (motivação da change). Renderizado
 * por componentes client (cada `error.tsx` é `"use client"`), então recebe o
 * handler de retry por prop sem cruzar fronteira de serialização.
 *
 * O retry usa a variante `default` (primary) — NÃO `destructive` (que pinta
 * texto de `text-destructive`, abaixo de AA como texto). O digest usa
 * `text-muted-foreground` cheio (AA ~6:1), não `/70` (cairia abaixo de 4.5).
 */
export function BoundaryRetryActions({
  onRetry,
  digest,
}: {
  onRetry: () => void
  digest?: string
}) {
  return (
    <>
      <p>Se o problema persistir, recarregue a página ou volte mais tarde.</p>
      <div>
        <Button type="button" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
      {digest ? (
        <p className="text-xs text-muted-foreground">Código do erro: {digest}</p>
      ) : null}
    </>
  )
}
