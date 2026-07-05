import { Callout } from "./Callout"
import { MockBracket } from "./mocks/MockBracket"
import { MockClassificacao } from "./mocks/MockClassificacao"
import { MockCompetidor } from "./mocks/MockCompetidor"

/**
 * "Veja por dentro": telas-chave do Goliseu como MOCKS FIÉIS renderizados em React
 * (não screenshots — preserva LCP/CLS e o tema dark/light), cada um com callouts de
 * anotação que ENSINAM o termo. O bloco visual do mock é decorativo (`aria-hidden`)
 * com `sr-only` descritivo; os callouts são texto REAL, auto-contido, visível a todos
 * (inclusive tecnologia assistiva). RSC puro.
 */

interface TelaAnotada {
  titulo: string
  descricaoSr: string
  mock: React.ReactNode
  callouts: { termo: string; texto: React.ReactNode }[]
}

const TELAS: TelaAnotada[] = [
  {
    titulo: "Classificação que se explica sozinha",
    descricaoSr:
      "Exemplo de tabela de classificação com pontos, a coluna de forma dos últimos cinco jogos e um selo de destaque de melhor ataque.",
    mock: <MockClassificacao />,
    callouts: [
      {
        termo: "Forma",
        texto: "os últimos 5 resultados de cada time em V/E/D, atualizados a cada placar.",
      },
      {
        termo: "Destaques",
        texto:
          "selos automáticos como melhor ataque, melhor defesa e sequências invictas.",
      },
    ],
  },
  {
    titulo: "Cada competidor tem história",
    descricaoSr:
      "Exemplo de página de competidor com escudo, promédio, número de temporadas, títulos e acessos.",
    mock: <MockCompetidor />,
    callouts: [
      {
        termo: "Promédio",
        texto:
          "a média de pontos por jogo somando todas as temporadas — o ranking histórico do clube.",
      },
      {
        termo: "Hall da fama",
        texto: "títulos, acessos e quedas acumulados ficam registrados para sempre.",
      },
    ],
  },
  {
    titulo: "Copas que valem um lugar na história",
    descricaoSr:
      "Exemplo de chaveamento de mata-mata com semifinais e final, destacando o campeão.",
    mock: <MockBracket />,
    callouts: [
      {
        termo: "Copa imortal",
        texto:
          "torneios de mata-mata paralelos à liga; quem levanta a taça entra para o hall — o título fica eternizado.",
      },
    ],
  },
]

export function TelasAnotadas() {
  return (
    <section
      aria-labelledby="telas-titulo"
      className="animate-rise flex flex-col gap-8"
      style={{ "--stagger": "540ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 id="telas-titulo" className="font-display text-2xl font-bold tracking-tight">
          Veja por dentro
        </h2>
        <p className="text-muted-foreground max-w-md text-balance">
          As telas de verdade do Goliseu — e o que cada detalhe significa.
        </p>
      </div>

      <ul className="flex list-none flex-col gap-8">
        {TELAS.map((tela) => (
          <li
            key={tela.titulo}
            className="grid items-center gap-4 sm:grid-cols-2 sm:gap-6"
          >
            <figure className="min-w-0">
              <div aria-hidden="true">{tela.mock}</div>
              <figcaption className="sr-only">{tela.descricaoSr}</figcaption>
            </figure>
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="font-display text-lg font-semibold tracking-tight">
                {tela.titulo}
              </h3>
              <ul className="flex list-none flex-col gap-2.5">
                {tela.callouts.map((c) => (
                  <Callout key={c.termo} termo={c.termo}>
                    {c.texto}
                  </Callout>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
