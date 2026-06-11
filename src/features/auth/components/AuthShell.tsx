import Link from "next/link"

import { GoliseuMark } from "@/components/goliseu-mark"
import { StadiumBackdrop } from "@/components/stadium-backdrop"

/**
 * Moldura das telas de autenticação: atmosfera de estádio + lockup de marca
 * (escudo com glow + wordmark + tagline) acima do card. Tira o "card sozinho
 * no vazio preto" — dá presença e contexto. O card real entra via children.
 */
export function AuthShell({
  children,
  tagline,
}: {
  children: React.ReactNode
  /** Linha curta sob a marca; default genérico. */
  tagline?: string
}) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6 py-16">
      <StadiumBackdrop />

      <Link
        href="/"
        aria-label="Goliseu — página inicial"
        className="animate-rise group flex flex-col items-center gap-3 rounded-2xl text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <span className="glow-primary flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/30 transition-transform motion-safe:group-hover:scale-105">
          <GoliseuMark className="size-8" />
        </span>
        <span className="flex flex-col items-center gap-1">
          <span className="font-display text-xl font-bold tracking-[0.3em] text-foreground">
            GOLISEU<span className="text-primary">.</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {tagline ?? "Torneios de clubes · placar ao vivo"}
          </span>
        </span>
      </Link>

      <div className="animate-rise w-full max-w-sm [--stagger:120ms]">
        {children}
      </div>
    </main>
  )
}
