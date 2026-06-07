import { Trophy } from "lucide-react"

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
          <tr className="border-b bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
            {COLUNAS.map((c) => {
              const rotulo = c.rotulo ?? rotuloLado
              const titulo = c.titulo ?? rotuloLado
              return (
                <th
                  key={c.chave}
                  scope="col"
                  className={
                    c.chave === "nome"
                      ? "px-3 py-2 text-left font-semibold"
                      : "px-2 py-2 text-center font-semibold"
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
          {linhas.map((linha) => {
            // 1º lugar é CONQUISTA: linha tingida de dourado + troféu. Empates
            // podem repetir posicao===1 — o destaque vale para toda linha líder.
            const ehLider = linha.posicao === 1
            return (
              <tr
                key={linha.participanteId}
                className={`border-b last:border-b-0 even:bg-muted/30 motion-safe:transition-colors hover:bg-accent/50 ${ehLider ? "bg-gold/8 hover:bg-gold/12" : ""}`}
              >
                <td className="px-2 py-2 text-center font-display font-bold tabular-nums">
                  <span className="inline-flex items-center justify-center gap-1">
                    {ehLider ? (
                      <Trophy className="size-3.5 text-gold" aria-hidden="true" />
                    ) : null}
                    {linha.posicao}º
                  </span>
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
