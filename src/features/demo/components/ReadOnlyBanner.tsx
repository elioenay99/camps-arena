import { Lock } from "lucide-react"

/**
 * Rótulo reutilizável para controles de gestão/ciclo de vida que existem no
 * produto real mas aparecem DESABILITADOS na demonstração — com explicação clara,
 * nunca acionando nada real.
 */
export function ReadOnlyBanner({
  titulo = "Ação de gestão",
  children,
}: {
  titulo?: string
  children?: React.ReactNode
}) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
    >
      <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium text-foreground/80">{titulo}</span>
        {" — "}
        {children ?? "Disponível no Goliseu real. Entre para gerenciar de verdade."}
      </span>
    </div>
  )
}
