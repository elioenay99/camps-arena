import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * CTA de fechamento da landing: reforça o valor (temporadas e copas que duram para
 * sempre, hall da fama) e leva ao fluxo de conta existente (`/cadastro` e `/login`).
 * Sem cobrança/checkout — só a narrativa e o CTA. RSC puro.
 */
export function ConversaoCta() {
  return (
    <section
      aria-labelledby="cta-titulo"
      className="animate-rise glow-primary flex flex-col items-center gap-6 rounded-3xl border bg-card/60 px-6 py-12 text-center backdrop-blur-sm"
      style={{ "--stagger": "900ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-3">
        <h2 id="cta-titulo" className="font-display max-w-xl text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          Temporadas e copas que duram{" "}
          <span className="text-gradient-brand">para sempre</span>
        </h2>
        <p className="text-muted-foreground max-w-md text-balance">
          Divisões ilimitadas, temporadas que se acumulam e um hall da fama para eternizar
          cada conquista. Comece de graça, sem cartão.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button asChild size="lg" className="glow-primary">
          <Link href="/cadastro">Criar conta grátis</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Já tenho conta</Link>
        </Button>
      </div>
    </section>
  )
}
