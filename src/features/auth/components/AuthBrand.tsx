import Link from "next/link";

/**
 * Wordmark da identidade exibido acima dos cards de autenticação.
 * Apenas decorativo/navegacional — leva à raiz. Sem interatividade (RSC).
 */
export function AuthBrand() {
  return (
    <Link
      href="/"
      className="font-display text-lg font-bold tracking-[0.25em] text-foreground"
    >
      ARENA<span className="text-primary">.</span>
    </Link>
  );
}
