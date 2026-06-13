import type { LucideIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Cartão presentacional de estado de FRONTEIRA — erro de rota (error boundary)
 * ou conteúdo inexistente (not-found) —, no idioma visual dos estados vazios já
 * polidos (EmptyActiveMatches/EstadoVazioSecao): chip de ícone + título em
 * `font-display` + `.elevate` + `animate-rise`. SEM `"use client"` (markup puro)
 * — usável tanto por boundaries client (error.tsx) quanto por RSC (not-found).
 *
 * Acessibilidade/AA: a cor `tone` recolore APENAS o chip de ícone (decorativo,
 * `aria-hidden` — limiar 3.0 para não-texto). Título fica no `foreground` e a
 * descrição em `muted-foreground`: usar `text-destructive` como TEXTO normal cai
 * ~4.08 no dark, abaixo de AA 4.5. Por isso o vermelho não vaza para o texto.
 */
export function BoundaryCard({
  Icon,
  tone = "neutro",
  titulo,
  descricao,
  role,
  className,
  children,
}: {
  Icon: LucideIcon
  /** "erro" tinge o chip de destrutivo; "neutro" usa o primário. */
  tone?: "erro" | "neutro"
  titulo: string
  descricao: React.ReactNode
  /** "alert" nos error boundaries (anúncio imediato); ausente no not-found. */
  role?: "alert"
  className?: string
  /** Ações e detalhes (botão de retry, "Voltar ao painel", código do erro). */
  children?: React.ReactNode
}) {
  const ehErro = tone === "erro"
  return (
    <Card role={role} className={cn("elevate animate-rise", className)}>
      <CardHeader className="gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-12 items-center justify-center rounded-2xl",
            ehErro
              ? "bg-destructive/10 text-destructive"
              : "bg-primary/10 text-primary"
          )}
        >
          <Icon className="size-6" />
        </span>
        <CardTitle className="font-display text-2xl">{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      {children ? (
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}
