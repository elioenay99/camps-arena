import {
  classesLinha,
  derivarEstiloLinha,
  LinhaCelulas,
  type PosicoesZona,
} from "@/features/standings/components/standingsCells"
import { StandingsRow } from "@/features/standings/components/StandingsRow"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import type { ItemForma } from "@/features/standings/insights"

const COLUNAS_BASE = [
  { chave: "pos", rotulo: "Pos", titulo: "Posição", prioritaria: true },
  // Rótulo do lado vem por prop: a tabela serve participantes E clubes.
  { chave: "nome", rotulo: null, titulo: null, prioritaria: true },
  { chave: "pontos", rotulo: "P", titulo: "Pontos", prioritaria: true },
  { chave: "jogos", rotulo: "J", titulo: "Jogos", prioritaria: true },
  { chave: "vitorias", rotulo: "V", titulo: "Vitórias", prioritaria: false },
  { chave: "empates", rotulo: "E", titulo: "Empates", prioritaria: false },
  { chave: "derrotas", rotulo: "D", titulo: "Derrotas", prioritaria: false },
  { chave: "golsPro", rotulo: "GP", titulo: "Gols pró", prioritaria: false },
  { chave: "golsContra", rotulo: "GC", titulo: "Gols contra", prioritaria: false },
  { chave: "saldo", rotulo: "SG", titulo: "Saldo de gols", prioritaria: true },
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

/** Coluna hoje oculta no compacto/mobile (só a linha de detalhe a revela). */
const OCULTA_COMPACTO = "group-data-[compacto=true]/standings:hidden"

/** Tabela de classificação — RSC puro: só renderiza o que o motor calculou. */
export function StandingsTable({
  linhas,
  rotuloLado = "Participante",
  zonas,
  promedioPorParticipante,
  formaPorParticipante,
  hrefCompetidorBase,
  ocultarCampeao = false,
  expansivel = false,
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
   * Forma (últimos 5 V/E/D) por `participanteId` (change add-insights-classificacao).
   * Quando presente, adiciona a coluna "Forma" (badges) — oculta no compacto para
   * não estourar o mobile. Ausente = sem coluna (comportamento legado).
   */
  formaPorParticipante?: Map<string, ItemForma[]>
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
  /**
   * Liga a DIVULGAÇÃO PROGRESSIVA por linha (change add-classificacao-a11y-responsiva):
   * quando `true`, cada linha é uma folha client (`StandingsRow`) que, no mobile
   * compacto, expõe o gatilho de expandir + a linha de detalhe. Só a standings-page
   * (via `ClassificacaoResponsiva`) liga; os consumidores crus deixam FALSE e
   * permanecem 100% RSC, sem `<button>` por linha. Default: FALSE.
   */
  expansivel?: boolean
}) {
  // Conjuntos de posições para lookup O(1). Vazios quando `zonas` é ausente —
  // o destaque some e a tabela volta ao comportamento standalone.
  const pos: PosicoesZona = {
    posAcesso: new Set(zonas?.acesso ?? []),
    posRebaixamento: new Set(zonas?.rebaixamento ?? []),
    // Zonas de PLAYOFF (vão à chave, não sobem/caem direto). Separadas das diretas:
    // uma posição é OU direta OU de chave, nunca as duas (partição no derivarZonas).
    posPlayoffAcesso: new Set(zonas?.playoffAcesso ?? []),
    posPlayoffRebaixamento: new Set(zonas?.playoffRebaixamento ?? []),
  }
  const temPlayoffAcesso = pos.posPlayoffAcesso.size > 0
  const temPlayoffRebaixamento = pos.posPlayoffRebaixamento.size > 0
  const temZonas =
    pos.posAcesso.size > 0 ||
    pos.posRebaixamento.size > 0 ||
    temPlayoffAcesso ||
    temPlayoffRebaixamento
  // Coluna de promédio (Fase 4): inserida logo após "Pos" quando há promedio —
  // a leitura "posição vs promédio" explica o corte contra-intuitivo.
  const temPromedio = promedioPorParticipante !== undefined
  const COLUNAS = temPromedio
    ? [
        COLUNAS_BASE[0],
        {
          chave: "promedio",
          rotulo: "Pro",
          titulo: "Promédio",
          prioritaria: true,
        } as const,
        ...COLUNAS_BASE.slice(1),
      ]
    : COLUNAS_BASE
  // Coluna "Forma" (últimos 5): última coluna, OCULTA no compacto (mobile) para
  // preservar o encaixe — badges custam largura.
  const temForma = formaPorParticipante !== undefined
  // colspan da linha de detalhe: todas as colunas + a coluna Forma quando houver.
  const colSpanN = COLUNAS.length + (temForma ? 1 : 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border">
      {/* min-w dá piso à tabela: sem ele, w-full nunca transborda o wrapper e
          o overflow-x-auto seria inerte — 10 colunas espremidas no mobile. */}
      <table className="w-full min-w-[34rem] text-sm group-data-[modo=caber]/standings:min-w-0 group-data-[modo=caber]/standings:text-xs group-data-[compacto=true]/standings:min-w-0">
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
                  className={`${
                    c.chave === "nome"
                      ? "px-3 py-2 text-left font-semibold"
                      : "px-2 py-2 text-center font-semibold group-data-[modo=caber]/standings:px-1"
                  }${c.prioritaria ? "" : ` ${OCULTA_COMPACTO}`}`}
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
            {temForma ? (
              <th
                scope="col"
                className={`px-2 py-2 text-center font-semibold ${OCULTA_COMPACTO}`}
              >
                <abbr title="Forma (últimos 5)" className="no-underline" aria-hidden="true">
                  Forma
                </abbr>
                <span className="sr-only">Forma nos últimos jogos</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const estilo = derivarEstiloLinha(linha, pos, ocultarCampeao)
            const promedioValor = promedioPorParticipante?.get(
              linha.participanteId,
            )
            const formaItens = formaPorParticipante?.get(linha.participanteId)
            // Com a expansão ligada, a linha é uma folha client (disclosure no
            // mobile). Sem ela, `<tr>` RSC pura — os consumidores crus não pagam
            // client nem `<button>` por linha.
            if (expansivel) {
              return (
                <StandingsRow
                  key={linha.participanteId}
                  linha={linha}
                  estilo={estilo}
                  temPromedio={temPromedio}
                  promedioValor={promedioValor}
                  hrefCompetidorBase={hrefCompetidorBase}
                  temForma={temForma}
                  formaItens={formaItens}
                  colSpanN={colSpanN}
                />
              )
            }
            return (
              <tr key={linha.participanteId} className={classesLinha(estilo)}>
                <LinhaCelulas
                  linha={linha}
                  estilo={estilo}
                  temPromedio={temPromedio}
                  promedioValor={promedioValor}
                  hrefCompetidorBase={hrefCompetidorBase}
                  temForma={temForma}
                  formaItens={formaItens}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>
      {temZonas || temPromedio ? (
        <ul className="flex list-none flex-wrap gap-x-4 gap-y-1 px-0.5 text-xs text-muted-foreground">
          {pos.posAcesso.size > 0 ? (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-1 rounded-full bg-primary/70"
              />
              Acesso (sobe)
            </li>
          ) : null}
          {pos.posRebaixamento.size > 0 ? (
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
