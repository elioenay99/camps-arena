import Link from "next/link";
import { type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { GoliseuMark } from "@/components/goliseu-mark";
import { StadiumBackdrop } from "@/components/stadium-backdrop";
import { TeamCrest } from "@/features/team/components/TeamCrest";
import { cn } from "@/lib/utils";

/**
 * Moldura do convite público (espelha o `AuthShell`): atmosfera de estádio +
 * marca Goliseu DISCRETA no topo (o herói da tela é o clube/estado, não a
 * marca). O painel real entra via children.
 */
export function ConviteShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      <StadiumBackdrop />

      <Link
        href="/"
        aria-label="Goliseu — página inicial"
        className="animate-rise group flex items-center gap-2 rounded-xl text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/30 transition-transform motion-safe:group-hover:scale-105">
          <GoliseuMark className="size-4" />
        </span>
        <span className="font-display text-sm font-bold tracking-[0.3em]">
          GOLISEU<span className="text-primary">.</span>
        </span>
      </Link>

      <div className="animate-rise w-full max-w-sm [--stagger:120ms]">
        {children}
      </div>
    </main>
  );
}

/** Painel central do convite — card com profundidade, conteúdo centrado. */
export function PainelConvite({ children }: { children: React.ReactNode }) {
  return (
    <Card className="elevate w-full">
      <CardContent className="grid gap-5 px-6 py-8 text-center">
        {children}
      </CardContent>
    </Card>
  );
}

/** Herói do convite de vaga: o ESCUDO do clube em destaque (decisão de produto). */
export function HeroClube({
  clube,
  torneio,
  escudoUrl,
}: {
  clube: string;
  torneio: string;
  escudoUrl: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <span className="glow-primary flex size-24 items-center justify-center rounded-full bg-primary/5 ring-1 ring-primary/25">
        <TeamCrest nome={clube} escudoUrl={escudoUrl} size={72} />
      </span>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-display text-2xl font-bold tracking-tight">
          {clube}
        </span>
        <span className="text-muted-foreground text-xs">{`em "${torneio}"`}</span>
      </div>
    </div>
  );
}

/** Herói por ícone: tom primário p/ ações/positivo, neutro p/ bloqueios. */
export function HeroIcone({
  icon: Icon,
  tone = "primary",
}: {
  icon: LucideIcon;
  tone?: "primary" | "muted";
}) {
  return (
    <span
      className={cn(
        "flex size-16 items-center justify-center self-center rounded-2xl ring-1",
        tone === "muted"
          ? "bg-muted text-muted-foreground ring-border"
          : "glow-primary bg-primary/10 text-primary ring-primary/30"
      )}
    >
      <Icon className="size-7" aria-hidden="true" />
    </span>
  );
}

/** Estado de bloqueio/erro: herói neutro + mensagem com `role="status"`. */
export function EstadoBloqueio({
  icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <PainelConvite>
      <HeroIcone icon={icon} tone="muted" />
      <p className="text-muted-foreground text-sm" role="status">
        {children}
      </p>
    </PainelConvite>
  );
}
