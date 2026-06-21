import type {
  CupCompetitionStatus,
  CupFormat,
  CupScope,
  CupSeasonStatus,
} from "@/lib/supabase/database.types"

/**
 * Rótulos pt-BR da feature COPAS — fonte única para listagem, página da copa,
 * página da edição e pílulas. Mantém a UI consistente sem repetir o mapeamento.
 */

export const CUP_SEASON_STATUS_LABEL: Record<CupSeasonStatus, string> = {
  rascunho: "Rascunho",
  montada: "Montada",
  ativa: "Em disputa",
  encerrada: "Encerrada",
}

export const CUP_COMPETITION_STATUS_LABEL: Record<CupCompetitionStatus, string> = {
  ativa: "Ativa",
  arquivada: "Arquivada",
}

export const CUP_FORMAT_LABEL: Record<CupFormat, string> = {
  mata_mata: "Mata-mata",
  grupos_mata_mata: "Grupos + mata-mata",
}

export const CUP_SCOPE_LABEL: Record<CupScope, string> = {
  nacional: "Nacional",
  continental: "Continental",
}
