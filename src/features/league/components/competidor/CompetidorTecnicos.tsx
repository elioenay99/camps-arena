import Link from "next/link"
import { UserCog } from "lucide-react"

import { UserAvatar } from "@/features/profile/components/UserAvatar"
import type {
  PassagemTecnico,
  TemporadaTecnicos,
} from "@/features/league/data/getTecnicosDoCompetidor"

/** Texto do período de comando ("rodadas 3–7", "desde o início", "grande final"). */
function periodo(p: PassagemTecnico): string {
  // Passagem da grande final (decisor) tem rodadas do torneio da final (à parte).
  if (p.decisorFinal) return "grande final"
  const inicio = p.rodadaInicio == null ? "início" : `rod. ${p.rodadaInicio}`
  if (p.vigente) {
    return p.rodadaInicio == null ? "desde o início" : `desde a rod. ${p.rodadaInicio}`
  }
  const fim = p.rodadaFim == null ? "?" : `rod. ${p.rodadaFim}`
  return `${inicio} até ${fim}`
}

/** Nome a exibir por passagem (removido = placeholder). */
function nomeExibido(p: PassagemTecnico): string {
  if (p.removido) return "Técnico removido"
  return p.nome?.trim() || "Sem nome"
}

/**
 * Uma passagem de técnico. Conta global → link para o perfil do técnico; técnico
 * LOCAL (vaga por-nome) ou REMOVIDO (conta apagada) → texto sem link.
 */
function PassagemItem({ passagem }: { passagem: PassagemTecnico }) {
  const nome = nomeExibido(passagem)
  const conteudo = (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar nome={passagem.removido ? null : nome} size={20} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm font-medium">
          {nome}
          {passagem.vigente ? (
            <span className="text-gold-ink ml-1.5 text-xs font-semibold">· atual</span>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">{periodo(passagem)}</span>
      </span>
    </span>
  )

  if (passagem.userId) {
    return (
      <Link
        href={`/dashboard/ligas/tecnico/${passagem.userId}`}
        prefetch={false}
        className="hover:bg-muted/40 -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors"
      >
        {conteudo}
      </Link>
    )
  }
  return <div className="-mx-2 flex items-center gap-2 px-2 py-1.5">{conteudo}</div>
}

/**
 * Linha do tempo de TÉCNICOS do clube (change add-tecnicos-historico): por
 * temporada, quem comandou a vaga e em quais rodadas, marcando o técnico vigente
 * ("atual"). Deriva de `coach_tenures` (vigência = `encerrada_em IS NULL`). Vazio
 * → a seção some (a página cobre o estado geral). RSC puro.
 */
export function CompetidorTecnicos({
  temporadas,
}: {
  temporadas: TemporadaTecnicos[]
}) {
  if (temporadas.length === 0) return null

  return (
    <section aria-labelledby="tecnicos-titulo" className="flex flex-col gap-3">
      <h2
        id="tecnicos-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <UserCog className="text-muted-foreground size-5" aria-hidden="true" />
        Técnicos
      </h2>

      <ol className="flex list-none flex-col gap-4 p-0">
        {temporadas.map((temporada, i) => (
          <li
            key={temporada.seasonId ?? `sem-temporada-${i}`}
            className="elevate flex flex-col gap-2 rounded-xl border p-4"
          >
            <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              {temporada.numero != null ? `Temporada ${temporada.numero}` : "Sem temporada"}
            </h3>
            <ul className="flex list-none flex-col gap-1 p-0">
              {temporada.passagens.map((passagem, j) => (
                <li key={`${passagem.userId ?? passagem.nome ?? "removido"}-${j}`}>
                  <PassagemItem passagem={passagem} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  )
}
