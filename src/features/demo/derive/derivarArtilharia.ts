import type { ArtilhariaLinha } from "@/features/league/data/getArtilharia"

import type { IdentidadeDemo, TorneioDemo } from "@/features/demo/store/tipos"

// Agregador de artilharia RECONSTRUÍDO no namespace demo — a agregação real mora
// em `getArtilharia.ts` (server-only, /data), então não pode ser importada. Espelha
// EXATAMENTE a regra: agrega por (competitorId, nome.toLowerCase()), ignora gol
// contra, escolhe a MENOR grafia como display, soma gols e ordena por
// gols desc → competitorNome → jogador.

export function derivarArtilharia(
  torneio: TorneioDemo,
  identidades: Record<string, IdentidadeDemo>
): ArtilhariaLinha[] {
  // (matchId, lado) → competidor daquele lado.
  const ladoDoMatch = new Map<string, { 1: string | null; 2: string | null }>()
  for (const p of torneio.partidas) {
    ladoDoMatch.set(p.id, { 1: p.participante_1, 2: p.participante_2 })
  }

  const acc = new Map<
    string,
    {
      competitorId: string
      competitorNome: string
      display: string
      gols: number
      escudoUrl: string | null
    }
  >()

  for (const g of torneio.gols) {
    if (g.contra) continue
    const competitorId = ladoDoMatch.get(g.matchId)?.[g.lado]
    if (!competitorId) continue
    const nome = (g.jogador ?? "").trim()
    if (nome === "") continue
    const ident = identidades[competitorId]
    const key = `${competitorId} ${nome.toLowerCase()}`
    const cur = acc.get(key)
    if (cur) {
      cur.gols += g.gols
      if (nome.localeCompare(cur.display) < 0) cur.display = nome
    } else {
      acc.set(key, {
        competitorId,
        competitorNome: ident?.nome ?? "Competidor",
        display: nome,
        gols: g.gols,
        escudoUrl: ident?.ehCompetitivo ? ident.escudoUrl : null,
      })
    }
  }

  return [...acc.values()]
    .map((v) => ({
      competitorId: v.competitorId,
      competitorNome: v.competitorNome,
      jogador: v.display,
      gols: v.gols,
      escudoUrl: v.escudoUrl,
    }))
    .sort(
      (a, b) =>
        b.gols - a.gols ||
        a.competitorNome.localeCompare(b.competitorNome) ||
        a.jogador.localeCompare(b.jogador)
    )
}
