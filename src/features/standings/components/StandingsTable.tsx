import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

const COLUNAS = [
  { chave: "pos", rotulo: "Pos", titulo: "Posição" },
  // Rótulo do lado vem por prop: a tabela serve participantes E clubes.
  { chave: "nome", rotulo: null, titulo: null },
  { chave: "pontos", rotulo: "P", titulo: "Pontos" },
  { chave: "jogos", rotulo: "J", titulo: "Jogos" },
  { chave: "vitorias", rotulo: "V", titulo: "Vitórias" },
  { chave: "empates", rotulo: "E", titulo: "Empates" },
  { chave: "derrotas", rotulo: "D", titulo: "Derrotas" },
  { chave: "golsPro", rotulo: "GP", titulo: "Gols pró" },
  { chave: "golsContra", rotulo: "GC", titulo: "Gols contra" },
  { chave: "saldo", rotulo: "SG", titulo: "Saldo de gols" },
] as const

/** Tabela de classificação — RSC puro: só renderiza o que o motor calculou. */
export function StandingsTable({
  linhas,
  rotuloLado = "Participante",
}: {
  linhas: LinhaComNome[]
  /** Rótulo da coluna de nome ("Participante" ou "Clube"). */
  rotuloLado?: string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      {/* min-w dá piso à tabela: sem ele, w-full nunca transborda o wrapper e
          o overflow-x-auto seria inerte — 10 colunas espremidas no mobile. */}
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">
          {`Classificação por ${rotuloLado.toLowerCase()}: posição, pontos e estatísticas`}
        </caption>
        <thead>
          <tr className="border-b bg-muted/50 text-muted-foreground">
            {COLUNAS.map((c) => {
              const rotulo = c.rotulo ?? rotuloLado
              const titulo = c.titulo ?? rotuloLado
              return (
                <th
                  key={c.chave}
                  scope="col"
                  className={
                    c.chave === "nome"
                      ? "px-3 py-2 text-left font-medium"
                      : "px-2 py-2 text-center font-medium"
                  }
                >
                  {/* abbr (tooltip no hover) escondida do leitor de tela; o
                      sr-only anuncia o título completo da coluna. */}
                  <abbr title={titulo} className="no-underline" aria-hidden="true">
                    {rotulo}
                  </abbr>
                  <span className="sr-only">{titulo}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.participanteId} className="border-b last:border-b-0">
              <td className="px-2 py-2 text-center font-semibold tabular-nums">
                {linha.posicao}º
              </td>
              <td className="px-3 py-2 text-left whitespace-nowrap">{linha.nome}</td>
              <td className="px-2 py-2 text-center font-semibold tabular-nums">
                {linha.pontos}
              </td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.jogos}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.vitorias}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.empates}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.derrotas}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.golsPro}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.golsContra}</td>
              <td className="px-2 py-2 text-center tabular-nums">{linha.saldo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
