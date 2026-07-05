"use client"

import { HelpCircle } from "lucide-react"
import type { ReactNode } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { TERMOS, type TermoId } from "@/features/glossario/termos"
import { cn } from "@/lib/utils"

/**
 * Ajuda contextual acessível de um termo de nicho. Renderiza o `children` (o
 * texto do termo, quando houver) seguido de um gatilho "?" que abre um Popover
 * com a explicação de uma frase. FOLHA client — as páginas ancoradas seguem RSC.
 *
 * A11y: abre por clique/toque/Enter/Espaço e fecha por Esc / clique-fora (Radix
 * gerencia foco, `aria-haspopup` e `aria-expanded`); o ícone é decorativo
 * (`aria-hidden`) e o nome acessível vem do `aria-label`. Alvo de toque
 * `size-11` (44px) no mobile, `md:size-8` no desktop (precedente `dialog.tsx`).
 */
export function Termo({
  id,
  children,
  className,
}: {
  id: TermoId
  children?: ReactNode
  className?: string
}) {
  const { rotulo, explicacao } = TERMOS[id]
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {children}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`O que é ${rotulo}?`}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:size-8 [&_svg]:size-4 md:[&_svg]:size-3.5"
          >
            <HelpCircle aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent>{explicacao}</PopoverContent>
      </Popover>
    </span>
  )
}
