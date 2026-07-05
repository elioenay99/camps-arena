"use client"

import { createContext, useContext } from "react"

/**
 * Contexto de densidade da classificação: `ClassificacaoResponsiva` publica o
 * `compacto` derivado (viewport × modo) e as folhas client por linha
 * (`StandingsRow`) o consomem para RENDERIZAR condicionalmente (via JS, não CSS)
 * o gatilho de expansão e a linha de detalhe. Fora de um provider (tabelas
 * cruas), o default `compacto=false` mantém o comportamento base.
 * change add-classificacao-a11y-responsiva.
 */
type StandingsModo = { compacto: boolean }

const StandingsModoContext = createContext<StandingsModo>({ compacto: false })

export const StandingsModoProvider = StandingsModoContext.Provider

export function useStandingsModo(): StandingsModo {
  return useContext(StandingsModoContext)
}
