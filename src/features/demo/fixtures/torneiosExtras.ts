import type { TournamentFormat, TournamentStatus } from "@/lib/supabase/database.types"

import type { TorneioDemo } from "@/features/demo/store/tipos"

// Torneios "casca" (sem partidas detalhadas) que dão VOLUME à lista para exercitar
// busca/filtro/ordenação/PAGINAÇÃO, com variedade temporal (recentes × antigos),
// de status (inclui rascunho/inativo e encerrado/arquivado) e um cenário de
// ALERTA (aviso de W.O. travado que exige atenção).

interface Semente {
  id: string
  nome: string
  formato: TournamentFormat
  status: TournamentStatus
  criadoEm: string
  aviso?: string
}

const SEMENTES: Semente[] = [
  { id: "t-copa-verao", nome: "Copa de Verão", formato: "grupos_mata_mata", status: "encerrado", criadoEm: "2025-12-02T12:00:00.000Z" },
  { id: "t-taca-cidade", nome: "Taça da Cidade", formato: "liga", status: "encerrado", criadoEm: "2026-01-15T12:00:00.000Z" },
  { id: "t-torneio-abertura", nome: "Torneio de Abertura", formato: "mata_mata", status: "ativo", criadoEm: "2026-02-20T12:00:00.000Z" },
  { id: "t-liga-bairro", nome: "Liga do Bairro", formato: "liga", status: "ativo", criadoEm: "2026-03-05T12:00:00.000Z", aviso: "3 W.O. seguidos travaram um técnico — decisão pendente do gestor." },
  { id: "t-copa-inverno", nome: "Copa de Inverno", formato: "grupos_mata_mata", status: "rascunho", criadoEm: "2026-06-10T12:00:00.000Z" },
  { id: "t-desafio-relampago", nome: "Desafio Relâmpago", formato: "mata_mata", status: "rascunho", criadoEm: "2026-06-25T12:00:00.000Z" },
  { id: "t-liga-master", nome: "Liga Master", formato: "liga", status: "ativo", criadoEm: "2026-04-12T12:00:00.000Z" },
  { id: "t-fase-liga-elite", nome: "Elite — Fase de Liga", formato: "fase_liga", status: "ativo", criadoEm: "2026-05-18T12:00:00.000Z" },
  { id: "t-copa-veteranos", nome: "Copa dos Veteranos", formato: "mata_mata", status: "encerrado", criadoEm: "2025-11-08T12:00:00.000Z" },
  { id: "t-torneio-amistoso", nome: "Torneio Amistoso", formato: "avulso", status: "rascunho", criadoEm: "2026-07-01T12:00:00.000Z" },
  { id: "t-copa-regional", nome: "Copa Regional", formato: "grupos_mata_mata", status: "ativo", criadoEm: "2026-03-28T12:00:00.000Z" },
  { id: "t-liga-juniores", nome: "Liga dos Juniores", formato: "liga", status: "encerrado", criadoEm: "2026-02-02T12:00:00.000Z" },
]

export const TORNEIOS_EXTRAS: TorneioDemo[] = SEMENTES.map((s) => ({
  id: s.id,
  nome: s.nome,
  formato: s.formato,
  status: s.status,
  criadoEm: s.criadoEm,
  corPrimaria: null,
  corSecundaria: null,
  regras: { vitoria: 3, empate: 1, derrota: 0 },
  tiebreaker: "cbf",
  participantes: [],
  partidas: [],
  gols: [],
  chave: [],
  terceiroLugar: false,
  aviso: s.aviso ?? null,
}))
