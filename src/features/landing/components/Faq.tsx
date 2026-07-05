import { ChevronDown } from "lucide-react"

/**
 * FAQ da landing via `<details>/<summary>` NATIVOS: acessível por teclado, abre/fecha
 * sem JavaScript (RSC puro, sem ilha client), zero CLS. Não há `accordion` em
 * `src/components/ui/` — e não instalamos dependência para isto. O chevron gira no
 * estado aberto via `group-open`.
 */

const PERGUNTAS: { p: string; r: React.ReactNode }[] = [
  {
    p: "É grátis?",
    r: "Sim. Você monta sua liga, lança placares e acompanha a classificação sem pagar nada.",
  },
  {
    p: "Preciso instalar?",
    r: "Não. O Goliseu roda direto no navegador. É um app instalável (PWA) se você quiser um atalho na tela inicial, mas a instalação é opcional.",
  },
  {
    p: "Serve para FIFA e eFootball?",
    r: "Sim — e para qualquer jogo ou campeonato entre amigos. O placar é lançado manualmente, então funciona para EA FC, eFootball, futebol de botão, truco, o que você quiser organizar.",
  },
  {
    p: "Funciona no celular?",
    r: "Funciona. A interface é pensada para o celular primeiro: cada um lança o resultado da própria partida na palma da mão.",
  },
  {
    p: "Posso ter várias divisões?",
    r: "Pode. Monte uma pirâmide com quantas séries quiser (A, B, C…), com acesso e rebaixamento entre elas a cada temporada.",
  },
]

export function Faq() {
  return (
    <section
      aria-labelledby="faq-titulo"
      className="animate-rise flex flex-col gap-6"
      style={{ "--stagger": "810ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id="faq-titulo" className="font-display text-2xl font-bold tracking-tight">
          Perguntas frequentes
        </h2>
      </div>

      <ul className="flex list-none flex-col gap-3">
        {PERGUNTAS.map(({ p, r }) => (
          <li key={p}>
            <details className="group bg-card/60 rounded-2xl border px-5 py-1 open:pb-4">
              <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:rounded focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                {p}
                <ChevronDown
                  className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="text-muted-foreground text-sm">{r}</p>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
