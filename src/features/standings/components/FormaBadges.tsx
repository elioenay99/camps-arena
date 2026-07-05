import type { ItemForma } from "@/features/standings/insights"

const ROTULO: Record<ItemForma["resultado"], string> = {
  V: "Vitória",
  E: "Empate",
  D: "Derrota",
}

// `text-primary-foreground` (não `text-white`) no "D": foreground ADAPTATIVO por
// tema (letra escura no dark, clara no light), garantindo AA sobre o fundo
// destrutivo nos DOIS temas mesmo com o token `--destructive` do dark clareado
// (senão o branco perderia contraste). change add-classificacao-a11y-responsiva.
const TOM: Record<ItemForma["resultado"], string> = {
  V: "bg-primary/85 text-primary-foreground",
  E: "bg-muted-foreground/35 text-foreground",
  D: "bg-destructive/85 text-primary-foreground",
}

/**
 * Sequência de badges V/E/D dos ÚLTIMOS 5 jogos (change add-insights-classificacao).
 * RSC puro. A cor NÃO é o único sinal: cada badge carrega a letra + `aria-label`
 * legível ("Vitória"/"Empate"/"Derrota"; W.O. anotado). Mais antigo à esquerda.
 */
export function FormaBadges({ itens }: { itens: ItemForma[] }) {
  const ultimos = itens.slice(-5)
  if (ultimos.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return (
    <span
      role="list"
      aria-label="Forma nos últimos jogos"
      className="inline-flex items-center gap-0.5"
    >
      {ultimos.map((it, i) => {
        const label = it.wo ? `${ROTULO[it.resultado]} por W.O.` : ROTULO[it.resultado]
        return (
          <span
            key={i}
            role="listitem"
            aria-label={label}
            title={label}
            className={`inline-flex size-5 items-center justify-center rounded-[0.28rem] text-[0.62rem] font-bold tabular-nums ${TOM[it.resultado]}`}
          >
            {it.resultado}
            <span className="sr-only">{label}</span>
          </span>
        )
      })}
    </span>
  )
}
