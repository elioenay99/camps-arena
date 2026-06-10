import Link from "next/link"
import { Plus, Swords } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

/**
 * Estado vazio convidativo do painel: ícone com glow, copy respirável e CTAs
 * reais (criar partida / torneio). Layout em flex-column simples — evita o
 * colapso de largura do grid do CardHeader (a descrição vinha espremida).
 */
export function EmptyActiveMatches() {
  return (
    <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
      >
        <Swords className="size-7" />
      </span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <h2 className="font-display text-xl font-bold">Nenhuma partida ativa</h2>
        <p className="text-sm text-muted-foreground">
          Quando uma partida estiver agendada ou em andamento, ela aparece aqui
          para o lançamento de placar ao vivo.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild className="rounded-full">
          <Link href="/dashboard/partidas/nova">
            <Plus aria-hidden="true" />
            Nova partida
          </Link>
        </Button>
        <Button asChild variant="outline" className="rounded-full">
          <Link href="/dashboard/torneios/novo">Criar torneio</Link>
        </Button>
      </div>
    </Card>
  )
}
