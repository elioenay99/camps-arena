import Link from "next/link"
import { Plus, Swords, Trophy } from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface EmptyActiveMatchesProps {
  /** Usuário não organiza nem participa de nenhum torneio (via `getMeusTorneios`). */
  semTorneios: boolean
  /** Usuário tem ao menos um torneio avulso aberto (via `getOwnTournaments`). */
  temAvulsoAberto: boolean
}

/**
 * Estado vazio convidativo do painel: ícone com glow, copy respirável e CTAs
 * reais. Ramifica em 3 estados conforme o contexto do usuário para garantir que
 * o primeiro clique SEMPRE leve a valor — "Nova partida" (que exige um torneio
 * avulso aberto) só aparece quando esse destino não é um beco.
 */
export function EmptyActiveMatches({
  semTorneios,
  temAvulsoAberto,
}: EmptyActiveMatchesProps) {
  // Precedência determinística. Invariante: (semTorneios && temAvulsoAberto) é
  // impossível — `organizo` (que zera semTorneios) já inclui o avulso aberto.
  if (semTorneios) {
    return (
      <Card className="elevate animate-rise flex flex-col items-center gap-5 px-6 py-14 text-center">
        <span
          aria-hidden="true"
          className="glow-primary flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <Trophy className="size-7" />
        </span>
        <div className="flex max-w-sm flex-col gap-1.5">
          <h2 className="font-display text-xl font-bold">
            Bem-vindo ao Goliseu
          </h2>
          <p className="text-sm text-muted-foreground">
            Monte seu primeiro campeonato e chame a galera — leva cerca de 1
            minuto. A partir daí, os placares e a classificação rolam sozinhos.
          </p>
        </div>
        {/* CTA longo: `buttonVariants` declara `whitespace-nowrap shrink-0` na
            base, combinação que impede tanto a quebra quanto o truncamento — em
            390px o rótulo vazava do card e era cortado nos DOIS lados, sem
            reticências. Desfeito localmente (a base segue certa para rótulo
            curto). `h-auto` é obrigatório junto de `whitespace-normal`: sem ele
            o `h-11` da variante cortaria a segunda linha. */}
        <Button
          asChild
          className="h-auto min-h-11 max-w-full rounded-full py-2 whitespace-normal"
        >
          <Link href="/dashboard/torneios/novo">
            <Plus aria-hidden="true" />
            Criar meu primeiro campeonato — leva 1 minuto
          </Link>
        </Button>
      </Card>
    )
  }

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
      {temAvulsoAberto ? (
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
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Button asChild className="rounded-full">
            <Link href="/dashboard/torneios/novo">
              <Plus aria-hidden="true" />
              Criar torneio
            </Link>
          </Button>
          <Link
            href="/dashboard/torneios"
            className={cn(
              buttonVariants({ variant: "link", size: "sm" }),
              // Alvo de toque ≥44px no mobile; compacto em md+.
              "min-h-11 md:min-h-0",
            )}
          >
            Ver meus torneios
          </Link>
        </div>
      )}
    </Card>
  )
}
