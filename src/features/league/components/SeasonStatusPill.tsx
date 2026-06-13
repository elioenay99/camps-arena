import {
  LEAGUE_SEASON_STATUS_LABEL,
  type LeagueSeasonStatus,
} from "@/features/league/leagueStatus"

/**
 * Pílula de status de uma temporada de pirâmide — fonte única (índice + página
 * da temporada). "Em disputa" ganha o ponto vivo; "encerrada" usa o dourado de
 * conquista; "sobe e cai" (em_fluxo) é accent; "rascunho" fica neutro.
 */
export function SeasonStatusPill({ status }: { status: LeagueSeasonStatus }) {
  const ativa = status === "ativa"
  const emFluxo = status === "em_fluxo"
  const encerrada = status === "encerrada"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ativa
          ? "border-primary/30 bg-primary/10 text-primary"
          : encerrada
            ? "border-gold/30 bg-gold/10 text-gold-ink"
            : emFluxo
              ? "border-accent/30 bg-accent/10 text-accent-foreground"
              : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {ativa ? (
        <span
          className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {LEAGUE_SEASON_STATUS_LABEL[status]}
    </span>
  )
}
