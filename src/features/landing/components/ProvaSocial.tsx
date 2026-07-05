import { Quote } from "lucide-react"

/**
 * PLACEHOLDER — trocar por depoimentos reais.
 *
 * Estes depoimentos são ILUSTRATIVOS (fabricados, primeiro nome + papel genérico),
 * NÃO clientes reais verificáveis. Numa página de aquisição, aspas+nome+papel sem
 * disclosure lê-se como endosso real — enganoso. Por isso a natureza de exemplo é
 * VISÍVEL ao usuário: o eyebrow "Exemplos ilustrativos" + o selo "Exemplo" em cada
 * card. Um comentário só no código NÃO bastaria. RSC puro.
 */

const DEPOIMENTOS: { texto: string; nome: string; papel: string }[] = [
  {
    texto:
      "Acabou a discussão de quem tá na frente. A tabela atualiza sozinha e ninguém contesta o rebaixamento.",
    nome: "Rafa",
    papel: "organiza a liga da firma",
  },
  {
    texto:
      "Montei três divisões com acesso e queda. A galera criou rivalidade de verdade pra não cair de série.",
    nome: "Léo",
    papel: "comanda o campeonato do prédio",
  },
  {
    texto:
      "O hall da fama fez a diferença: cada temporada vira história e todo mundo quer o próprio título eternizado.",
    nome: "Dani",
    papel: "joga eFootball com os amigos",
  },
]

export function ProvaSocial() {
  return (
    <section
      aria-labelledby="prova-social-titulo"
      className="animate-rise flex flex-col gap-6"
      style={{ "--stagger": "720ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        {/* Disclosure VISÍVEL: deixa claro que são exemplos, não clientes reais. */}
        <span className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
          Exemplos ilustrativos
        </span>
        <h2
          id="prova-social-titulo"
          className="font-display text-2xl font-bold tracking-tight"
        >
          Feito para quem leva a pelada a sério
        </h2>
        <p className="text-muted-foreground max-w-md text-balance text-sm">
          Depoimentos ilustrativos de como o Goliseu pode ser usado — não são clientes
          reais.
        </p>
      </div>

      <ul className="grid list-none gap-4 sm:grid-cols-3">
        {DEPOIMENTOS.map((d) => (
          <li key={d.nome}>
            <figure className="bg-card/60 flex h-full flex-col gap-4 rounded-2xl border p-5">
              <div className="flex items-center justify-between">
                <Quote className="text-primary size-5" aria-hidden="true" />
                <span className="text-muted-foreground bg-muted/50 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                  Exemplo
                </span>
              </div>
              <blockquote className="text-sm">{d.texto}</blockquote>
              <figcaption className="text-muted-foreground mt-auto text-sm">
                <span className="text-foreground font-medium">{d.nome}</span> — {d.papel}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}
