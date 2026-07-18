"use client"

import { useDemoContext } from "./DemoProvider"
import { flagsDoPerfil, type FlagsPerfil } from "./perfil"
import type { TorneioDemo } from "./tipos"

/** Estado + dispatch + reset. */
export function useDemoStore() {
  return useDemoContext()
}

/** Flags de UI derivadas do perfil fictício atual (síncronas). */
export function usePerfilFlags(): FlagsPerfil {
  const { state } = useDemoContext()
  return flagsDoPerfil(state.perfil)
}

/** Um torneio por id (ou undefined). */
export function useTorneio(id: string): TorneioDemo | undefined {
  const { state } = useDemoContext()
  return state.torneios.find((t) => t.id === id)
}
