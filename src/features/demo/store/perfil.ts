// Perfil fictício da demonstração. Simula APENAS permissões de INTERFACE — nunca
// cria sessão, autentica ou chama endpoint. As flags reais do produto
// (`podeGerir`/`podeModerar`…) são server-only assíncronas (RPC Supabase) e
// quebrariam no cliente; aqui elas são reimplementadas locais e SÍNCRONAS,
// derivadas do perfil escolhido, e passadas por prop aos presentacionais.

export type PerfilDemo = "visitante" | "tecnico" | "gestor" | "admin"

export const PERFIS_DEMO: PerfilDemo[] = [
  "visitante",
  "tecnico",
  "gestor",
  "admin",
]

export const ROTULO_PERFIL: Record<PerfilDemo, string> = {
  visitante: "Visitante",
  tecnico: "Técnico",
  gestor: "Gestor",
  admin: "Administrador",
}

/** Descrição curta do que cada perfil enxerga (UI). */
export const DESCRICAO_PERFIL: Record<PerfilDemo, string> = {
  visitante: "Explora competições e experimenta placares, sem ações de gestão",
  tecnico: "Experimenta placares e acompanha a visão de um técnico",
  gestor: "Gerencia o campeonato (iniciar, encerrar, moderar)",
  admin: "Acesso total, incluindo bastidores",
}

/** Conjunto de gates de UI espelhando os do produto (grep: podeGerir/podeModerar/…). */
export interface FlagsPerfil {
  podeGerir: boolean
  podeModerar: boolean
  podeArbitrar: boolean
  podeReabrir: boolean
  podeVerBastidores: boolean
  podeAvancar: boolean
  podeFechar: boolean
}

const NENHUMA: FlagsPerfil = {
  podeGerir: false,
  podeModerar: false,
  podeArbitrar: false,
  podeReabrir: false,
  podeVerBastidores: false,
  podeAvancar: false,
  podeFechar: false,
}

const GESTAO: FlagsPerfil = {
  podeGerir: true,
  podeModerar: true,
  podeArbitrar: true,
  podeReabrir: true,
  podeVerBastidores: false,
  podeAvancar: true,
  podeFechar: true,
}

/** Deriva as flags de UI a partir do perfil fictício (puro, síncrono). */
export function flagsDoPerfil(perfil: PerfilDemo): FlagsPerfil {
  switch (perfil) {
    case "admin":
      return { ...GESTAO, podeVerBastidores: true }
    case "gestor":
      return GESTAO
    case "tecnico":
      // O técnico interage com as próprias partidas (o placar interativo já é de
      // todos na demo), mas não desbloqueia gestão do campeonato.
      return NENHUMA
    case "visitante":
    default:
      return NENHUMA
  }
}
