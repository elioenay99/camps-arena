import type { TournamentStatus } from "@/lib/supabase/database.types"

const LABEL_STATUS: Record<TournamentStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  encerrado: "Encerrado",
}

/**
 * Pílula de status do torneio — fonte única (índice + página do torneio).
 * "Ativo" ganha o ponto vivo (em jogo); "encerrado" usa o dourado de conquista;
 * "rascunho" fica neutro.
 */
export function StatusPill({ status }: { status: TournamentStatus }) {
  const ativo = status === "ativo"
  const encerrado = status === "encerrado"
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        ativo
          ? "border-primary/30 bg-primary/10 text-primary"
          : encerrado
            ? "border-gold/30 bg-gold/10 text-gold-ink"
            : "border-border bg-muted/40 text-muted-foreground"
      }`}
    >
      {ativo ? (
        <span
          className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
          aria-hidden="true"
        />
      ) : null}
      {LABEL_STATUS[status]}
    </span>
  )
}
