import { Trophy } from "lucide-react"

import { escudoPublicUrl } from "@/lib/escudos"
import { TeamCrest } from "@/features/team/components/TeamCrest"

/**
 * Mock FIEL de um mata-mata (não screenshot): semifinais → final, comunicando a
 * "copa imortal". Dados curados hardcoded, escudos reais, decorativo (`aria-hidden`
 * na seção que o compõe). RSC puro.
 */

interface TimeMock {
  nome: string
  id: number
  placar: number
  vence?: boolean
}

const SEMIS: [TimeMock, TimeMock][] = [
  [
    { nome: "Flamengo", id: 127, placar: 2, vence: true },
    { nome: "Grêmio", id: 130, placar: 1 },
  ],
  [
    { nome: "Cruzeiro", id: 135, placar: 0 },
    { nome: "Santos", id: 128, placar: 1, vence: true },
  ],
]
const FINAL: [TimeMock, TimeMock] = [
  { nome: "Flamengo", id: 127, placar: 3, vence: true },
  { nome: "Santos", id: 128, placar: 2 },
]

export function MockBracket() {
  return (
    <div className="glow-primary flex flex-col gap-3 rounded-2xl border bg-card/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-medium">Mata-mata</p>
        <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          Copa
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="font-display text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Semifinais
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SEMIS.map((confronto, i) => (
              <Confronto key={i} confronto={confronto} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-display text-gold-ink inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
            <Trophy className="size-3.5" aria-hidden="true" />
            Final
          </p>
          <Confronto confronto={FINAL} campea />
        </div>
      </div>
    </div>
  )
}

function Confronto({
  confronto,
  campea = false,
}: {
  confronto: [TimeMock, TimeMock]
  campea?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border p-2 ${
        campea ? "border-gold/30 bg-gold/8" : "bg-muted/30"
      }`}
    >
      {confronto.map((time) => (
        <div key={time.nome} className="flex items-center gap-2">
          <TeamCrest nome={time.nome} escudoUrl={escudoPublicUrl(time.id)} size={20} />
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              time.vence ? "font-semibold" : "text-muted-foreground"
            }`}
          >
            {time.nome}
          </span>
          <span
            className={`font-display text-sm font-bold tabular-nums ${
              time.vence ? "" : "text-muted-foreground"
            }`}
          >
            {time.placar}
          </span>
        </div>
      ))}
    </div>
  )
}
