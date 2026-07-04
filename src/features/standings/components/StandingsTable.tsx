import Link from "next/link"
import { Trophy } from "lucide-react"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"

const COLUNAS_BASE = [
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
  /** Posições que SOBEM DIRETO (faixa primary). */
  acesso: number[]
  /** Posições que CAEM DIRETO (faixa destructive). */
  rebaixamento: number[]
  /** Posições que vão à CHAVE de acesso (faixa gold tracejada). */
  playoffAcesso?: number[]
  /** Posições que vão à CHAVE de playout (faixa gold tracejada). */
  playoffRebaixamento?: number[]
}

/** Tabela de classificação — RSC puro: só renderiza o que o motor calculou. */
export function StandingsTable({
  linhas,
  rotuloLado = "Participante",
  zonas,
  promedioPorParticipante,
  hrefCompetidorBase,
  ocultarCampeao = false,
}: {
  linhas: LinhaComNome[]
  /** Rótulo da coluna de nome ("Participante" ou "Clube"). */
  rotuloLado?: string
  /**
   * Zonas de sobe/cai por posição (pirâmide de ligas). Ausente = tabela
   * standalone (comportamento inalterado — nenhum destaque de zona).
   */
  zonas?: StandingsZonas
  /**
   * Promedio por `participanteId` (Fase 4 — divisões `promedios`). Quando
   * presente, exibe a coluna "Pro" (média de pontos-por-jogo, `0.000`) e o rodapé
   * explica que o corte segue o promédio. Ausente = sem coluna (default).
   */
  promedioPorParticipante?: Map<string, number>
  /**
   * Base do link do nome (ex.: `/dashboard/ligas/competidor`). Quando presente, o
   * nome vira um `Link` para `${hrefCompetidorBase}/${participanteId}`. Ausente =
   * nome em texto (torneios avulsos inalterados).
   */
  hrefCompetidorBase?: string
  /**
   * Tabela que NÃO coroa líder (Fase 5.1 — tabela ANUAL COMBINADA do split). Quando
   * `true`, a posição 1 não recebe o destaque de campeão (sem fundo dourado, sem
   * troféu): o título da divisão sai da GRANDE FINAL, não da combinada. Ausente/false
   * = comportamento atual (1º lugar destacado como campeão).
   */
  ocultarCampeao?: boolean
}) {
  // Conjuntos de posições para lookup O(1). Vazios quando `zonas` é ausente —
  // o destaque some e a tabela volta ao comportamento standalone.
  const posAcesso = new Set(zonas?.acesso ?? [])
  const posRebaixamento = new Set(zonas?.rebaixamento ?? [])
  // Zonas de PLAYOFF (vão à chave, não sobem/caem direto). Separadas das diretas:
  // uma posição é OU direta OU de chave, nunca as duas (partição no derivarZonas).
  const posPlayoffAcesso = new Set(zonas?.playoffAcesso ?? [])
  const posPlayoffRebaixamento = new Set(zonas?.playoffRebaixamento ?? [])
  const temPlayoffAcesso = posPlayoffAcesso.size > 0
  const temPlayoffRebaixamento = posPlayoffRebaixamento.size > 0
  const temZonas =
    posAcesso.size > 0 ||
    posRebaixamento.size > 0 ||
    temPlayoffAcesso ||
    temPlayoffRebaixamento
  // Coluna de promédio (Fase 4): inserida logo após "Pos" quando há promedio —
  // a leitura "posição vs promédio" explica o corte contra-intuitivo.
  const temPromedio = promedioPorParticipante !== undefined
  const COLUNAS = temPromedio
    ? [
        COLUNAS_BASE[0],
        { chave: "promedio", rotulo: "Pro", titulo: "Promédio" } as const,
        ...COLUNAS_BASE.slice(1),
      ]
    : COLUNAS_BASE
  const fmtPromedio = (v: number) => v.toFixed(3)
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
      {/* min-w dá piso à tabela: sem ele, w-full nunca transborda o wrapper e
          o overflow-x-auto seria inerte — 10 colunas espremidas no mobile. */}
      <table className="w-full min-w-[34rem] text-sm group-data-[modo=caber]/standings:min-w-0 group-data-[modo=caber]/standings:text-xs">
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
                      : "px-2 py-2 text-center font-semibold group-data-[modo=caber]/standings:px-1"
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
            // `ocultarCampeao` (combinada do split) suprime o destaque: o título
            // da divisão sai da grande final, não desta tabela.
            const ehLider = !ocultarCampeao && linha.posicao === 1
            // Zonas da pirâmide (posicionais). O ouro do líder tem prioridade
            // sobre qualquer faixa de zona (a pos. 1 mora numa zona de acesso/
            // playoff). Por isso o `tom` de zona só pinta quando NÃO é líder.
            const ehAcesso = posAcesso.has(linha.posicao)
            const ehRebaixamento = posRebaixamento.has(linha.posicao)
            // Zona de CHAVE (playoff). Cor escolhida: GOLD/âmbar TRACEJADO — 3ª
            // cor distinta de primary (acesso direto), destructive (queda direta)
            // e accent (hover/sorteio). O ouro do líder usa faixa SÓLIDA + troféu
            // + texto gold-ink; a zona de chave usa borda TRACEJADA + tom mais
            // sutil (gold/8 < gold/12 do líder) e mantém o TEXTO padrão (foreground),
            // distinguindo as duas leituras de ouro sem criar token novo.
            // Contraste AA: o texto continua foreground (alto contraste) nos dois
            // temas; gold só pinta stripe/borda/tom de fundo — a mesma família do
            // líder, que já valida AA em Dracula (dark) e Canarinho (light).
            const ehPlayoff =
              posPlayoffAcesso.has(linha.posicao) ||
              posPlayoffRebaixamento.has(linha.posicao)
            // Faixa lateral SÓLIDA (acesso/queda diretos). Playoff usa borda
            // tracejada (abaixo), não esta faixa — leitura visual distinta.
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
                  : !ehLider && ehPlayoff
                    ? "bg-gold/8 hover:bg-gold/12"
                    : ""
            const temFaixa = faixa !== ""
            // Borda esquerda TRACEJADA dourada = marca da zona de chave (só quando
            // não há faixa sólida; partição garante que nunca coexistem).
            const ehPlayoffMarcado = ehPlayoff && !temFaixa
            return (
              <tr
                key={linha.participanteId}
                className={`border-b last:border-b-0 even:bg-muted/30 motion-safe:transition-colors hover:bg-accent/50 ${ehLider ? "bg-gold/12 hover:bg-gold/16" : tom}`}
              >
                <td
                  className={`px-2 py-2 text-center font-display font-bold tabular-nums group-data-[modo=caber]/standings:px-1 ${
                    temFaixa
                      ? `relative before:absolute before:inset-y-0 before:left-0 before:w-1 ${faixa}`
                      : ehPlayoffMarcado
                        ? "border-l-2 border-dashed border-gold/70"
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
                {temPromedio ? (
                  <td className="px-2 py-2 text-center font-semibold tabular-nums group-data-[modo=caber]/standings:px-1">
                    {fmtPromedio(promedioPorParticipante.get(linha.participanteId) ?? 0)}
                  </td>
                ) : null}
                <td className="px-3 py-2 text-left min-w-0">
                  <span className="flex min-w-0 items-center gap-2 whitespace-nowrap group-data-[modo=caber]/standings:whitespace-normal">
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
                    {hrefCompetidorBase ? (
                      <Link
                        href={`${hrefCompetidorBase}/${linha.participanteId}`}
                        className="rounded underline-offset-2 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {linha.nome}
                      </Link>
                    ) : (
                      linha.nome
                    )}
                  </span>
                </td>
                <td className="px-2 py-2 text-center font-semibold tabular-nums group-data-[modo=caber]/standings:px-1">
                  {linha.pontos}
                </td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.jogos}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.vitorias}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.empates}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.derrotas}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.golsPro}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.golsContra}</td>
                <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">{linha.saldo}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      {temZonas || temPromedio ? (
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
          {/* Playoff: faixa dourada TRACEJADA (espelha a borda da linha). Rótulo
              específico por lado; se ambos coexistirem, "Playoff" cobre os dois. */}
          {temPlayoffAcesso || temPlayoffRebaixamento ? (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-0.5 border-l-2 border-dashed border-gold/70"
              />
              {temPlayoffAcesso && temPlayoffRebaixamento
                ? "Playoff"
                : temPlayoffAcesso
                  ? "Playoff de acesso"
                  : "Playout"}
            </li>
          ) : null}
          {temPromedio ? (
            <li className="flex items-center gap-1.5">
              <span aria-hidden="true" className="font-semibold tabular-nums">
                Pro
              </span>
              Corte por promédio (média de pontos por jogo)
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
