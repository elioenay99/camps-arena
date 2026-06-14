import type { ReactNode } from "react";

import { onColor } from "@/features/championship/championshipTheme";
import { cn } from "@/lib/utils";

export type ChampionshipBadgeProps = {
  /** Ícone do campeonato (formato, Layers, etc.). */
  icon: ReactNode;
  primary?: string | null;
  secondary?: string | null;
  className?: string;
};

/**
 * Selo de identidade do campeonato: quando há cor, o fundo é o gradiente das
 * DUAS cores cruas (com o ícone em contraste calculado); sem cor, cai no
 * `bg-primary/10 text-primary` neutro do app (que, dentro de uma subárvore
 * tematizada, já recolore sozinho pela primária). change add-cores-campeonato.
 */
export function ChampionshipBadge({
  icon,
  primary,
  secondary,
  className,
}: ChampionshipBadgeProps) {
  const p = primary ?? secondary ?? null;
  const s = secondary ?? primary ?? null;
  const themed = Boolean(p);

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        !themed && "bg-primary/10 text-primary",
        className,
      )}
      style={
        themed
          ? {
              backgroundImage: `linear-gradient(150deg, ${p}, ${s})`,
              color: onColor(p as string),
            }
          : undefined
      }
    >
      {icon}
    </span>
  );
}
