import type { CompetidorPerfil } from "@/features/league/data/getCompetitorProfile"

import { Card } from "@/components/ui/card"

/**
 * Cartões compactos de agregados de vida toda: promédio, temporadas, Σpontos,
 * Σjogos. Grid mobile-first (2 colunas no celular, 4 a partir de sm). RSC puro.
 */
export function CompetidorAgregados({ perfil }: { perfil: CompetidorPerfil }) {
  const itens = [
    {
      rotulo: "Promédio",
      valor: perfil.totalJogos > 0 ? perfil.promedio.toFixed(3) : "—",
      hint: "pontos por jogo · temporadas encerradas",
    },
    {
      rotulo: "Temporadas",
      valor: String(perfil.temporadasDisputadas),
      hint: "encerradas",
    },
    {
      rotulo: "Pontos",
      valor: String(perfil.totalPontos),
      hint: "somados",
    },
    {
      rotulo: "Jogos",
      valor: String(perfil.totalJogos),
      hint: "disputados",
    },
  ]

  return (
    <section aria-labelledby="agregados-titulo" className="flex flex-col gap-3">
      <h2
        id="agregados-titulo"
        className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Números de vida toda
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {itens.map((item) => (
          <Card
            key={item.rotulo}
            size="sm"
            className="elevate items-start gap-1 px-3.5 py-3"
          >
            <span className="text-muted-foreground text-xs font-medium">
              {item.rotulo}
            </span>
            <span className="font-display text-2xl font-bold tracking-tight tabular-nums">
              {item.valor}
            </span>
            <span className="text-muted-foreground text-[0.7rem] leading-tight">
              {item.hint}
            </span>
          </Card>
        ))}
      </div>
    </section>
  )
}
