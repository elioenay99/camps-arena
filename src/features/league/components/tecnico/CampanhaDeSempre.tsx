import { Card } from "@/components/ui/card"
import type { Campanha } from "@/features/standings/coachStats"

/**
 * Campanha de sempre do técnico (change add-perfil-tecnico-carreira): números
 * agregados de todas as partidas creditadas por janela de comando. Grid
 * mobile-first (2 colunas no celular, 4 a partir de sm). RSC puro. Quando o
 * técnico não tem jogos creditados, exibe um estado vazio sem quebrar a página.
 */
export function CampanhaDeSempre({ total }: { total: Campanha }) {
  if (total.jogos === 0) {
    return (
      <section aria-labelledby="campanha-titulo" className="flex flex-col gap-3">
        <h2
          id="campanha-titulo"
          className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
        >
          Campanha de sempre
        </h2>
        <div className="bg-muted/10 rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-muted-foreground text-sm">
            Sem partidas creditadas ainda. Quando este técnico dirigir jogos
            numa pirâmide visível para você, a campanha aparece aqui.
          </p>
        </div>
      </section>
    )
  }

  const saldo = total.saldo > 0 ? `+${total.saldo}` : String(total.saldo)
  const itens: { rotulo: string; valor: string; hint: string }[] = [
    { rotulo: "Jogos", valor: String(total.jogos), hint: "dirigidos" },
    { rotulo: "Aproveitamento", valor: `${total.aproveitamento}%`, hint: "convenção 3-1-0" },
    { rotulo: "Vitórias", valor: String(total.vitorias), hint: "no comando" },
    { rotulo: "Empates", valor: String(total.empates), hint: "no comando" },
    { rotulo: "Derrotas", valor: String(total.derrotas), hint: "no comando" },
    { rotulo: "Saldo", valor: saldo, hint: "gols pró − contra" },
    { rotulo: "Gols pró", valor: String(total.golsPro), hint: "marcados" },
    { rotulo: "Gols contra", valor: String(total.golsContra), hint: "sofridos" },
  ]

  return (
    <section aria-labelledby="campanha-titulo" className="flex flex-col gap-3">
      <h2
        id="campanha-titulo"
        className="text-muted-foreground text-xs font-semibold tracking-wide uppercase"
      >
        Campanha de sempre
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
