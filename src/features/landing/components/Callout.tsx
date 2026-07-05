import { CornerDownRight } from "lucide-react"

/**
 * Anotação de ensino que acompanha um mock ilustrativo da landing. Fica EM FLUXO
 * (abaixo do mock), nunca posicionada de forma absoluta — assim não estoura a
 * viewport a 390px. O texto é auto-contido (não diz "esta coluna", que um leitor
 * de tela não veria, já que o mock é `aria-hidden`): ensina o termo por completo.
 * RSC puro.
 */
export function Callout({
  termo,
  children,
}: {
  termo: string
  children: React.ReactNode
}) {
  return (
    <li className="text-muted-foreground flex items-start gap-2 text-sm">
      <CornerDownRight
        className="text-primary mt-0.5 size-4 shrink-0"
        aria-hidden="true"
      />
      <span>
        <strong className="text-foreground font-medium">{termo}:</strong> {children}
      </span>
    </li>
  )
}
