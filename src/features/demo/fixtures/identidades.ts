import type { IdentidadeDemo } from "@/features/demo/store/tipos"

// ~20 competidores fictícios. `escudoUrl`/`avatarUrl` SEMPRE null → fallback de
// iniciais (zero rede ao Storage). Mistura de identidade de CLUBE
// (`ehCompetitivo: true`) e de PESSOA/por-nome (`ehCompetitivo: false`) para
// exercitar os dois mundos do produto.

interface Semente {
  id: string
  nome: string
  ehCompetitivo: boolean
  tecnico?: string
}

const SEMENTES: Semente[] = [
  { id: "c-leoes", nome: "Leões do Norte", ehCompetitivo: true, tecnico: "Ary Mendes" },
  { id: "c-tempestade", nome: "Tempestade FC", ehCompetitivo: true, tecnico: "Bruno Sá" },
  { id: "c-montanha", nome: "Montanha EC", ehCompetitivo: true, tecnico: "Caio Lopes" },
  { id: "c-litoral", nome: "Litoral United", ehCompetitivo: true, tecnico: "Dario Reis" },
  { id: "c-vulcao", nome: "Vulcão SC", ehCompetitivo: true, tecnico: "Elias Prado" },
  { id: "c-aurora", nome: "Aurora FC", ehCompetitivo: true, tecnico: "Fábio Nunes" },
  { id: "c-planalto", nome: "Planalto AC", ehCompetitivo: true, tecnico: "Gil Moraes" },
  { id: "c-cometa", nome: "Cometa EC", ehCompetitivo: true, tecnico: "Hugo Dias" },
  { id: "c-baluarte", nome: "Baluarte FC", ehCompetitivo: true, tecnico: "Ivo Castro" },
  { id: "c-farol", nome: "Farol United", ehCompetitivo: true, tecnico: "Jonas Melo" },
  { id: "c-raizes", nome: "Raízes SC", ehCompetitivo: true, tecnico: "Kaio Brito" },
  { id: "c-orion", nome: "Órion FC", ehCompetitivo: true, tecnico: "Léo Vasques" },
  { id: "c-pantanal", nome: "Pantanal EC", ehCompetitivo: true, tecnico: "Marco Aznar" },
  { id: "c-sertao", nome: "Sertão AC", ehCompetitivo: true, tecnico: "Nino Rocha" },
  // Por-nome (identidade de pessoa).
  { id: "p-ataias", nome: "Ataias", ehCompetitivo: false },
  { id: "p-danilo", nome: "Danilo", ehCompetitivo: false },
  { id: "p-jhon", nome: "Jhonathan", ehCompetitivo: false },
  { id: "p-marcela", nome: "Marcela", ehCompetitivo: false },
  { id: "p-rafa", nome: "Rafa", ehCompetitivo: false },
  { id: "p-tiago", nome: "Tiago", ehCompetitivo: false },
]

export const IDENTIDADES: Record<string, IdentidadeDemo> = Object.fromEntries(
  SEMENTES.map((s) => [
    s.id,
    {
      id: s.id,
      nome: s.nome,
      ehCompetitivo: s.ehCompetitivo,
      escudoUrl: null,
      avatarUrl: null,
      tecnico: s.tecnico ?? null,
    } satisfies IdentidadeDemo,
  ])
)

/** Ids de todas as identidades (ordem estável). */
export const TODOS_IDS: string[] = SEMENTES.map((s) => s.id)

export function nomeDe(id: string): string {
  return IDENTIDADES[id]?.nome ?? "Competidor"
}
