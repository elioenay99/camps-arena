/**
 * Seção "Como funciona": 3-4 passos ordenados (semântica `<ol>` para tecnologia
 * assistiva), do setup ao hall da fama. RSC puro.
 */

const PASSOS: { titulo: string; descricao: string }[] = [
  {
    titulo: "Monte a liga e as divisões",
    descricao:
      "Crie sua liga, defina as séries (A, B, C…) e convide a galera. Cada divisão com seus clubes.",
  },
  {
    titulo: "Lance os placares",
    descricao:
      "Cada um registra o resultado da própria partida pelo celular. A classificação atualiza na hora.",
  },
  {
    titulo: "Suba, caia e vire a temporada",
    descricao:
      "No fim, os primeiros sobem e os últimos caem. Você encerra a temporada e o histórico se acumula.",
  },
  {
    titulo: "Eternize no hall da fama",
    descricao:
      "Títulos, acessos e copas ficam registrados no perfil de cada competidor — para sempre.",
  },
]

export function ComoFunciona() {
  return (
    <section
      aria-labelledby="como-funciona-titulo"
      className="animate-rise flex flex-col gap-6"
      style={{ "--stagger": "630ms" } as React.CSSProperties}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h2
          id="como-funciona-titulo"
          className="font-display text-2xl font-bold tracking-tight"
        >
          Como funciona
        </h2>
        <p className="text-muted-foreground max-w-md text-balance">
          Da primeira rodada ao hall da fama, em quatro passos.
        </p>
      </div>

      <ol className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PASSOS.map((passo, i) => (
          <li
            key={passo.titulo}
            className="bg-card/60 flex flex-col gap-3 rounded-2xl border p-5"
          >
            <span
              aria-hidden="true"
              className="bg-primary/10 text-primary font-display inline-flex size-9 items-center justify-center rounded-full text-base font-bold"
            >
              {i + 1}
            </span>
            <h3 className="font-display text-base font-semibold tracking-tight">
              {passo.titulo}
            </h3>
            <p className="text-muted-foreground text-sm">{passo.descricao}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
