import { Trophy } from "lucide-react"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
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

/** Zonas de acesso/rebaixamento (posições 1-based) — destaque da pirâmide. */
export interface StandingsZonas {
  /** Posições que SOBEM (faixa positiva/accent). */
  acesso: number[]
  /** Posições que CAEM (faixa destrutiva/mutada). */
  rebaixamento: number[]
}

/** Tabela de classificação — RSC puro: só renderiza o que o motor calculou. */
export function StandingsTable({
  linhas,
  rotuloLado = "Participante",
  zonas,
}: {
  linhas: LinhaComNome[]
  /** Rótulo da coluna de nome ("Participante" ou "Clube"). */
  rotuloLado?: string
  /**
   * Zonas de sobe/cai por posição (pirâmide de ligas). Ausente = tabela
   * standalone (comportamento inalterado — nenhum destaque de zona).
   */
  zonas?: StandingsZonas
}) {
  // Conjuntos de posições para lookup O(1). Vazios quando `zonas` é ausente —
  // o destaque some e a tabela volta ao comportamento standalone.
  const posAcesso = new Set(zonas?.acesso ?? [])
  const posRebaixamento = new Set(zonas?.rebaixamento ?? [])
  const temZonas = posAcesso.size > 0 || posRebaixamento.size > 0
  return (
    <div className="flex flex-col gap-2">
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
            // Zonas da pirâmide (posicionais). O ouro do líder tem prioridade
            // sobre o accent de acesso (a pos. 1 mora na zona de acesso).
            const ehAcesso = posAcesso.has(linha.posicao)
            const ehRebaixamento = posRebaixamento.has(linha.posicao)
            // Faixa lateral (indicador de zona) — só pinta quando há zonas.
            const faixa = ehRebaixamento
              ? "before:bg-destructive/70"
              : ehAcesso
                ? "before:bg-primary/70"
                : ""
            const tom =
              !ehLider && ehRebaixamento
                ? "bg-destructive/10 hover:bg-destructive/14"
                : !ehLider && ehAcesso
                  ? "bg-primary/8 hover:bg-primary/12"
                  : ""
            const temFaixa = faixa !== ""
            return (
              <tr
                key={linha.participanteId}
                className={`border-b last:border-b-0 even:bg-muted/30 motion-safe:transition-colors hover:bg-accent/50 ${ehLider ? "bg-gold/12 hover:bg-gold/16" : tom}`}
              >
                <td
                  className={`px-2 py-2 text-center font-display font-bold tabular-nums ${
                    temFaixa
                      ? `relative before:absolute before:inset-y-0 before:left-0 before:w-1 ${faixa}`
                      : ""
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center gap-1 ${
                      ehLider ? "rounded-md px-1 text-gold-ink" : ""
                    }`}
                  >
                    {ehLider ? (
                      <Trophy className="size-3.5 text-gold-ink" aria-hidden="true" />
                    ) : null}
                    {linha.posicao}º
                  </span>
                </td>
                <td className="px-3 py-2 text-left">
                  <span className="flex items-center gap-2 whitespace-nowrap">
                    {linha.escudoUrl ? (
                      <TeamCrest
                        nome={linha.nome}
                        escudoUrl={linha.escudoUrl}
                        size={24}
                      />
                    ) : (
                      <UserAvatar
                        nome={linha.nome}
                        avatarUrl={linha.avatarUrl}
                        size={24}
                      />
                    )}
                    {linha.nome}
                  </span>
                </td>
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
      {temZonas ? (
        <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 px-0.5 text-xs text-muted-foreground">
          {posAcesso.size > 0 ? (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-1 rounded-full bg-primary/70"
              />
              Acesso (sobe)
            </li>
          ) : null}
          {posRebaixamento.size > 0 ? (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-1 rounded-full bg-destructive/70"
              />
              Rebaixamento (cai)
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
