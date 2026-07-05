import { Swords, Shield, Flame, Trophy, ShieldCheck, Gauge } from "lucide-react"

import type { Destaques } from "@/features/standings/insights"

/**
 * Bloco de "Destaques" da classificação (change add-insights-classificacao): cards
 * automáticos derivados das partidas (melhor ataque/defesa, maior goleada, maiores
 * sequências, média de gols). RSC puro. `nomePorId` resolve o rótulo do lado
 * (clube/rótulo/participante). Renderiza nada quando não há destaque algum.
 */
export function DestaquesClassificacao({
  destaques,
  nomePorId,
}: {
  destaques: Destaques
  nomePorId: Map<string, string>
}) {
  const nome = (id: string) => nomePorId.get(id) ?? "—"
  const {
    melhorAtaque,
    melhorDefesa,
    maiorGoleada,
    maiorInvencibilidade,
    maiorSequenciaVitorias,
    maiorSequenciaCleanSheets,
    mediaGolsPorJogo,
  } = destaques

  const temAlgum =
    melhorAtaque !== null ||
    melhorDefesa !== null ||
    maiorGoleada !== null ||
    maiorInvencibilidade !== null ||
    maiorSequenciaVitorias !== null ||
    maiorSequenciaCleanSheets !== null ||
    mediaGolsPorJogo > 0
  if (!temAlgum) return null

  const cards: {
    Icon: typeof Swords
    titulo: string
    valor: string
    detalhe: string
  }[] = []

  if (melhorAtaque) {
    cards.push({
      Icon: Swords,
      titulo: "Melhor ataque",
      valor: `${melhorAtaque.valor} gols`,
      detalhe: nome(melhorAtaque.participanteId),
    })
  }
  if (melhorDefesa) {
    cards.push({
      Icon: Shield,
      titulo: "Melhor defesa",
      valor: `${melhorDefesa.valor} sofridos`,
      detalhe: nome(melhorDefesa.participanteId),
    })
  }
  if (maiorGoleada) {
    cards.push({
      Icon: Flame,
      titulo: "Maior goleada",
      valor: `${maiorGoleada.placarVencedor} x ${maiorGoleada.placarPerdedor}`,
      detalhe: `${nome(maiorGoleada.vencedorId)} sobre ${nome(maiorGoleada.perdedorId)}`,
    })
  }
  if (maiorSequenciaVitorias) {
    cards.push({
      Icon: Trophy,
      titulo: "Sequência de vitórias",
      valor: `${maiorSequenciaVitorias.extensao} jogos`,
      detalhe: nome(maiorSequenciaVitorias.participanteId),
    })
  }
  if (maiorInvencibilidade) {
    cards.push({
      Icon: Flame,
      titulo: "Maior invencibilidade",
      valor: `${maiorInvencibilidade.extensao} jogos`,
      detalhe: nome(maiorInvencibilidade.participanteId),
    })
  }
  if (maiorSequenciaCleanSheets) {
    cards.push({
      Icon: ShieldCheck,
      titulo: "Jogos sem sofrer gol",
      valor: `${maiorSequenciaCleanSheets.extensao} jogos`,
      detalhe: nome(maiorSequenciaCleanSheets.participanteId),
    })
  }
  if (mediaGolsPorJogo > 0) {
    cards.push({
      Icon: Gauge,
      titulo: "Média de gols",
      valor: mediaGolsPorJogo.toFixed(2),
      detalhe: "por jogo",
    })
  }

  return (
    <section aria-labelledby="destaques-titulo" className="flex flex-col gap-3">
      <h3
        id="destaques-titulo"
        className="font-display flex items-center gap-2 text-base font-bold tracking-tight"
      >
        <Flame className="size-4 text-gold-ink" aria-hidden="true" />
        Destaques
      </h3>
      <ul className="grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-3">
        {cards.map((c) => (
          <li
            key={c.titulo}
            className="elevate flex flex-col gap-0.5 rounded-xl border bg-muted/20 px-3 py-3"
          >
            <span className="text-muted-foreground flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide uppercase">
              <c.Icon className="size-3.5" aria-hidden="true" />
              {c.titulo}
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {c.valor}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {c.detalhe}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
