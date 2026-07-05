import {
  ArrowDown,
  ArrowUp,
  CalendarSync,
  Sigma,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react"

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/**
 * Seção "Profundidade": cards que ENSINAM os termos de nicho do Goliseu — acesso,
 * rebaixamento, promédio, temporada, copa imortal, hall da fama. Tokens de cor
 * semânticos (primary = acesso, destructive = queda, gold = troféu), coerentes com o
 * app. RSC puro, dados hardcoded. Ensina a profundidade SEM login.
 */

type Tom = "primary" | "destructive" | "gold" | "muted"

interface Termo {
  icone: LucideIcon
  titulo: string
  descricao: string
  tom: Tom
}

const TERMOS: Termo[] = [
  {
    icone: ArrowUp,
    titulo: "Acesso",
    descricao:
      "Terminou no topo da sua divisão? Sobe de série na próxima temporada, como no futebol de verdade.",
    tom: "primary",
  },
  {
    icone: ArrowDown,
    titulo: "Rebaixamento",
    descricao:
      "Ficou na zona? Cai para a divisão de baixo. Toda partida importa até a última rodada.",
    tom: "destructive",
  },
  {
    icone: Sigma,
    titulo: "Promédio",
    descricao:
      "A média de pontos por jogo somando todas as temporadas — o ranking histórico que diz quem é grande de verdade.",
    tom: "muted",
  },
  {
    icone: CalendarSync,
    titulo: "Temporada",
    descricao:
      "O ciclo completo: joga, sobe ou cai, e vira a temporada. O histórico se acumula ano após ano.",
    tom: "muted",
  },
  {
    icone: Sparkles,
    titulo: "Copa imortal",
    descricao:
      "Mata-matas paralelos à liga. Quem levanta a taça entra para a história — o título fica para sempre.",
    tom: "gold",
  },
  {
    icone: Trophy,
    titulo: "Hall da fama",
    descricao:
      "Cada competidor tem uma estante: títulos, acessos e quedas registrados temporada a temporada.",
    tom: "gold",
  },
]

const TOM_ICONE: Record<Tom, string> = {
  primary: "bg-primary/10 text-primary",
  destructive: "bg-destructive/10 text-destructive",
  gold: "bg-gold/12 text-gold-ink",
  muted: "bg-muted text-foreground",
}

export function ProfundidadeCards() {
  return (
    <section
      aria-labelledby="profundidade-titulo"
      className="animate-rise flex flex-col gap-6"
      style={{ "--stagger": "450ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2
          id="profundidade-titulo"
          className="font-display text-2xl font-bold tracking-tight"
        >
          Não é um bolão. É uma liga.
        </h2>
        <p className="text-muted-foreground max-w-md text-balance">
          Divisões, acesso e queda, temporadas que viram e copas que ficam. Os termos que
          fazem o Goliseu ter a profundidade do futebol real.
        </p>
      </div>

      <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TERMOS.map((termo) => {
          const Icone = termo.icone
          return (
            <li key={termo.titulo}>
              <Card className="h-full">
                <CardHeader>
                  <span
                    aria-hidden="true"
                    className={`mb-2 inline-flex size-9 items-center justify-center rounded-lg ${TOM_ICONE[termo.tom]}`}
                  >
                    <Icone className="size-5" />
                  </span>
                  <CardTitle className="font-display text-base">{termo.titulo}</CardTitle>
                  <CardDescription>{termo.descricao}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
