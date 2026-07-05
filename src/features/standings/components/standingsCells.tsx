import type { ReactNode } from "react"
import Link from "next/link"
import { Trophy } from "lucide-react"

import { TeamCrest } from "@/features/team/components/TeamCrest"
import { UserAvatar } from "@/features/profile/components/UserAvatar"
import { FormaBadges } from "@/features/standings/components/FormaBadges"
import type { LinhaComNome } from "@/features/standings/data/getTournamentClassificacao"
import type { ItemForma } from "@/features/standings/insights"

/**
 * Estilo derivado de uma linha da classificação (líder, faixa de zona, tom de
 * fundo, e o rótulo acessível da zona). Calculado no servidor
 * (`derivarEstiloLinha`) e reusado pelo caminho RSC (`StandingsTable`) e pela
 * folha client (`StandingsRow`), sem duplicar a lógica de zonas.
 * change add-classificacao-a11y-responsiva.
 */
export interface EstiloLinha {
  ehLider: boolean
  faixa: string
  temFaixa: boolean
  ehPlayoffMarcado: boolean
  tom: string
  /** Nome da zona para leitor de tela (sr-only); null fora de zona. */
  zonaLabel: string | null
}

export interface PosicoesZona {
  posAcesso: Set<number>
  posRebaixamento: Set<number>
  posPlayoffAcesso: Set<number>
  posPlayoffRebaixamento: Set<number>
}

/** Deriva o estilo + o rótulo de zona de uma linha (mesma lógica da faixa/legenda). */
export function derivarEstiloLinha(
  linha: LinhaComNome,
  pos: PosicoesZona,
  ocultarCampeao: boolean,
): EstiloLinha {
  const ehLider = !ocultarCampeao && linha.posicao === 1
  const ehAcesso = pos.posAcesso.has(linha.posicao)
  const ehRebaixamento = pos.posRebaixamento.has(linha.posicao)
  const ehPlayoffAcesso = pos.posPlayoffAcesso.has(linha.posicao)
  const ehPlayoffRebaixamento = pos.posPlayoffRebaixamento.has(linha.posicao)
  const ehPlayoff = ehPlayoffAcesso || ehPlayoffRebaixamento
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
  const ehPlayoffMarcado = ehPlayoff && !temFaixa
  // Rótulo acessível da zona (sr-only): reusa os mesmos textos da legenda.
  const zonaLabel = ehRebaixamento
    ? "Zona de rebaixamento"
    : ehAcesso
      ? "Zona de acesso"
      : ehPlayoffAcesso
        ? "Zona de playoff de acesso"
        : ehPlayoffRebaixamento
          ? "Zona de playout"
          : null
  return { ehLider, faixa, temFaixa, ehPlayoffMarcado, tom, zonaLabel }
}

/** Classe da `<tr>` da linha (líder em dourado; tom de zona; zebra por `even:`). */
export function classesLinha(estilo: EstiloLinha): string {
  return `border-b last:border-b-0 even:bg-muted/30 motion-safe:transition-colors hover:bg-accent/50 ${
    estilo.ehLider ? "bg-gold/12 hover:bg-gold/16" : estilo.tom
  }`
}

/** Classe utilitária das estatísticas SECUNDÁRIAS (ocultas no compacto/mobile). */
const OCULTA_COMPACTO = "group-data-[compacto=true]/standings:hidden"

/**
 * Sequência de células de uma linha (posição, [promédio], NOME como cabeçalho de
 * linha, P/J/V/E/D/GP/GC/SG, [forma]). É uma função de células (sem hooks),
 * chamada dentro de uma `<tr>` tanto no caminho RSC quanto no client. O NOME é
 * `<th scope="row">` (associa as células à linha) e carrega o `sr-only` da zona;
 * `chevron` (quando presente) é o gatilho de expansão no compacto.
 */
export function LinhaCelulas({
  linha,
  estilo,
  temPromedio,
  promedioValor,
  hrefCompetidorBase,
  temForma,
  formaItens,
  chevron,
}: {
  linha: LinhaComNome
  estilo: EstiloLinha
  temPromedio: boolean
  promedioValor?: number
  hrefCompetidorBase?: string
  temForma: boolean
  formaItens?: ItemForma[]
  chevron?: ReactNode
}) {
  const { ehLider, faixa, temFaixa, ehPlayoffMarcado, zonaLabel } = estilo
  return (
    <>
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
          {(promedioValor ?? 0).toFixed(3)}
        </td>
      ) : null}
      <th
        scope="row"
        className="min-w-0 px-3 py-2 text-left font-normal"
      >
        <span className="flex min-w-0 items-center gap-2 whitespace-nowrap group-data-[modo=caber]/standings:whitespace-normal">
          {zonaLabel ? <span className="sr-only">{zonaLabel}</span> : null}
          {linha.escudoUrl ? (
            <TeamCrest nome={linha.nome} escudoUrl={linha.escudoUrl} size={24} />
          ) : (
            <UserAvatar nome={linha.nome} avatarUrl={linha.avatarUrl} size={24} />
          )}
          {hrefCompetidorBase ? (
            <Link
              href={`${hrefCompetidorBase}/${linha.participanteId}`}
              // Sem prefetch: a pirâmide renderiza ~40 links por vez; o prefetch
              // no viewport dispararia ~40 renders RSC de uma vez (N+1 → 503). Ver
              // change add-liga-prefetch-fix.
              prefetch={false}
              className="rounded underline-offset-2 hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {linha.nome}
            </Link>
          ) : (
            linha.nome
          )}
          {chevron}
        </span>
      </th>
      <td className="px-2 py-2 text-center font-semibold tabular-nums group-data-[modo=caber]/standings:px-1">
        {linha.pontos}
      </td>
      <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">
        {linha.jogos}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1 ${OCULTA_COMPACTO}`}
      >
        {linha.vitorias}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1 ${OCULTA_COMPACTO}`}
      >
        {linha.empates}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1 ${OCULTA_COMPACTO}`}
      >
        {linha.derrotas}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1 ${OCULTA_COMPACTO}`}
      >
        {linha.golsPro}
      </td>
      <td
        className={`px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1 ${OCULTA_COMPACTO}`}
      >
        {linha.golsContra}
      </td>
      <td className="px-2 py-2 text-center tabular-nums group-data-[modo=caber]/standings:px-1">
        {linha.saldo}
      </td>
      {temForma ? (
        <td
          className={`px-2 py-2 text-center whitespace-nowrap ${OCULTA_COMPACTO}`}
        >
          <FormaBadges itens={formaItens ?? []} />
        </td>
      ) : null}
    </>
  )
}

/**
 * Rótulos das estatísticas SECUNDÁRIAS reveladas na linha de detalhe (compacto).
 * Ordem espelha as colunas ocultas.
 */
export function estatisticasSecundarias(
  linha: LinhaComNome,
): Array<{ rotulo: string; valor: number }> {
  return [
    { rotulo: "Vitórias", valor: linha.vitorias },
    { rotulo: "Empates", valor: linha.empates },
    { rotulo: "Derrotas", valor: linha.derrotas },
    { rotulo: "Gols pró", valor: linha.golsPro },
    { rotulo: "Gols contra", valor: linha.golsContra },
  ]
}
