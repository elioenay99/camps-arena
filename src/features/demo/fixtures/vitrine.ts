import type { ItemVitrineDemo } from "@/features/demo/store/tipos"

// Vitrine pública (Explorar): volume suficiente para PAGINAÇÃO, mix liga/torneio,
// status variados (inclui rascunho/inativo) e datas recentes × antigas para
// exercitar busca/filtro/ordenação. O cenário de lista VAZIA é alcançável
// desmarcando todos os "listado" (toggle otimista) ou filtrando sem resultado.

export const VITRINE: ItemVitrineDemo[] = [
  { id: "v-liga-ouro", tipo: "liga", nome: "Liga Goliseu — Série Ouro", formato: "liga", status: "ativo", criadoEm: "2026-05-01T12:00:00.000Z", competidores: 12, corPrimaria: "#7c3aed", corSecundaria: "#f5c518", listado: true },
  { id: "v-copa-relampago", tipo: "torneio", nome: "Copa Relâmpago", formato: "mata_mata", status: "encerrado", criadoEm: "2026-03-10T12:00:00.000Z", competidores: 8, corPrimaria: "#0ea5e9", corSecundaria: "#f5c518", listado: true },
  { id: "v-copa-verao", tipo: "torneio", nome: "Copa de Verão", formato: "grupos_mata_mata", status: "encerrado", criadoEm: "2025-12-02T12:00:00.000Z", competidores: 16, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-liga-bairro", tipo: "liga", nome: "Liga do Bairro", formato: "liga", status: "ativo", criadoEm: "2026-03-05T12:00:00.000Z", competidores: 10, corPrimaria: "#16a34a", corSecundaria: null, listado: true },
  { id: "v-taca-cidade", tipo: "torneio", nome: "Taça da Cidade", formato: "liga", status: "encerrado", criadoEm: "2026-01-15T12:00:00.000Z", competidores: 14, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-liga-master", tipo: "liga", nome: "Liga Master", formato: "liga", status: "ativo", criadoEm: "2026-04-12T12:00:00.000Z", competidores: 18, corPrimaria: "#dc2626", corSecundaria: null, listado: true },
  { id: "v-elite-fase-liga", tipo: "torneio", nome: "Elite — Fase de Liga", formato: "fase_liga", status: "ativo", criadoEm: "2026-05-18T12:00:00.000Z", competidores: 20, corPrimaria: "#9333ea", corSecundaria: null, listado: true },
  { id: "v-copa-regional", tipo: "torneio", nome: "Copa Regional", formato: "grupos_mata_mata", status: "ativo", criadoEm: "2026-03-28T12:00:00.000Z", competidores: 16, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-copa-veteranos", tipo: "torneio", nome: "Copa dos Veteranos", formato: "mata_mata", status: "encerrado", criadoEm: "2025-11-08T12:00:00.000Z", competidores: 8, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-liga-juniores", tipo: "liga", nome: "Liga dos Juniores", formato: "liga", status: "encerrado", criadoEm: "2026-02-02T12:00:00.000Z", competidores: 12, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-torneio-abertura", tipo: "torneio", nome: "Torneio de Abertura", formato: "mata_mata", status: "ativo", criadoEm: "2026-02-20T12:00:00.000Z", competidores: 8, corPrimaria: "#0891b2", corSecundaria: null, listado: true },
  { id: "v-copa-primavera", tipo: "torneio", nome: "Copa da Primavera", formato: "grupos_mata_mata", status: "ativo", criadoEm: "2026-06-01T12:00:00.000Z", competidores: 24, corPrimaria: null, corSecundaria: null, listado: true },
  { id: "v-liga-regional-b", tipo: "liga", nome: "Liga Regional B", formato: "liga", status: "rascunho", criadoEm: "2026-06-20T12:00:00.000Z", competidores: 10, corPrimaria: null, corSecundaria: null, listado: false },
  { id: "v-copa-dos-campeoes", tipo: "torneio", nome: "Copa dos Campeões", formato: "mata_mata", status: "ativo", criadoEm: "2026-05-30T12:00:00.000Z", competidores: 16, corPrimaria: "#f59e0b", corSecundaria: "#111827", listado: true },
]
