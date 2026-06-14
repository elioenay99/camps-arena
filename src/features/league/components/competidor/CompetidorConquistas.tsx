import { ArrowDown, ArrowUp, Award, Crown, Trophy } from "lucide-react"

import type { CompetidorPerfil } from "@/features/league/data/getCompetitorProfile"

/**
 * Badges de conquista: campeão da elite, títulos, acessos, quedas. Zerados ficam
 * APAGADOS (em vez de sumir) para dar a leitura do "ainda não conquistou" sem
 * esconder a categoria. Dourado (gold-ink + troféu) para títulos/elite, primary
 * para acessos, destructive para quedas. RSC puro.
 */
export function CompetidorConquistas({ perfil }: { perfil: CompetidorPerfil }) {
  const badges = [
    {
      chave: "elite",
      rotulo: "Campeão da elite",
      valor: perfil.titulosElite,
      Icone: Crown,
      tom: "gold" as const,
      ativoSr: `Campeão da elite ${perfil.titulosElite} ${perfil.titulosElite === 1 ? "vez" : "vezes"}`,
    },
    {
      chave: "titulos",
      rotulo: "Títulos",
      valor: perfil.titulos,
      Icone: Trophy,
      tom: "gold" as const,
      ativoSr: `${perfil.titulos} ${perfil.titulos === 1 ? "título" : "títulos"}`,
    },
    {
      chave: "acessos",
      rotulo: "Acessos",
      valor: perfil.acessos,
      Icone: ArrowUp,
      tom: "primary" as const,
      ativoSr: `${perfil.acessos} ${perfil.acessos === 1 ? "acesso" : "acessos"}`,
    },
    {
      chave: "quedas",
      rotulo: "Quedas",
      valor: perfil.quedas,
      Icone: ArrowDown,
      tom: "destructive" as const,
      ativoSr: `${perfil.quedas} ${perfil.quedas === 1 ? "queda" : "quedas"}`,
    },
  ]

  // Tudo zerado → nada de conquista. A seção some por completo (o estado vazio
  // da página já cobre o "sem temporadas").
  const temAlguma = badges.some((b) => b.valor > 0)
  if (!temAlguma) return null

  return (
    <section aria-labelledby="conquistas-titulo" className="flex flex-col gap-3">
      <h2
        id="conquistas-titulo"
        className="font-display flex items-center gap-2 text-lg font-bold tracking-tight"
      >
        <Award className="size-5 text-gold-ink" aria-hidden="true" />
        Conquistas
      </h2>
      <ul className="grid list-none grid-cols-2 gap-3 sm:grid-cols-4">
        {badges.map(({ chave, rotulo, valor, Icone, tom, ativoSr }) => {
          const ativo = valor > 0
          const corAtiva =
            tom === "gold"
              ? "border-gold/30 bg-gold/12 text-gold-ink"
              : tom === "primary"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-destructive/30 bg-destructive/10 text-destructive"
          return (
            <li
              key={chave}
              className={`elevate flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 text-center ${
                ativo ? corAtiva : "border-border bg-muted/20 text-muted-foreground opacity-60"
              }`}
            >
              <Icone className="size-5" aria-hidden="true" />
              <span className="font-display text-2xl font-bold tabular-nums">
                {valor}
                <span aria-hidden="true" className="text-base font-semibold">
                  ×
                </span>
              </span>
              <span className="text-xs font-medium">{rotulo}</span>
              <span className="sr-only">
                {ativo ? ativoSr : `${rotulo}: nenhum`}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
