"use client"

import * as React from "react"

import { demoReducer, type DemoAction, type DemoState } from "./demoReducer"
import { criarEstadoInicial } from "./estadoInicial"

const CHAVE_STORAGE = "goliseu:demo:v1"

interface DemoContextValor {
  state: DemoState
  dispatch: React.Dispatch<DemoAction>
  /** Reinicia a demonstração ao seed (e limpa a persistência local). */
  reiniciar: () => void
}

const DemoContext = React.createContext<DemoContextValor | null>(null)

export function DemoProvider({ children }: { children: React.ReactNode }) {
  // Semeia SEMPRE pelo seed determinístico (o servidor não tem localStorage;
  // ler no lazy-init causaria mismatch de hidratação). A re-hidratação do
  // localStorage acontece num useEffect pós-mount.
  const [state, dispatch] = React.useReducer(
    demoReducer,
    undefined,
    criarEstadoInicial
  )
  // Ref (não state) evita setState-em-effect: a persistência lê o ref, sem
  // re-render extra. Effect 1 roda antes do Effect 2 no mesmo commit.
  const hidratadoRef = React.useRef(false)

  // Passo 1 (pós-mount): re-hidrata do localStorage, se houver estado salvo.
  React.useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE_STORAGE)
      if (bruto) {
        const salvo = JSON.parse(bruto) as DemoState
        dispatch({ type: "REINICIAR", seed: salvo })
      }
    } catch {
      // Estado corrompido/versão antiga → ignora e mantém o seed.
    }
    hidratadoRef.current = true
  }, [])

  // Passo 2: persiste as mudanças (só depois de hidratar, para não sobrescrever
  // o salvo com o seed antes de lê-lo).
  React.useEffect(() => {
    if (!hidratadoRef.current) return
    try {
      window.localStorage.setItem(CHAVE_STORAGE, JSON.stringify(state))
    } catch {
      // Cota cheia / modo privado → segue sem persistir.
    }
  }, [state])

  const reiniciar = React.useCallback(() => {
    try {
      window.localStorage.removeItem(CHAVE_STORAGE)
    } catch {
      // ignora
    }
    dispatch({ type: "REINICIAR", seed: criarEstadoInicial() })
  }, [])

  const valor = React.useMemo<DemoContextValor>(
    () => ({ state, dispatch, reiniciar }),
    [state, reiniciar]
  )

  return <DemoContext.Provider value={valor}>{children}</DemoContext.Provider>
}

export function useDemoContext(): DemoContextValor {
  const ctx = React.useContext(DemoContext)
  if (!ctx) {
    throw new Error("useDemoContext deve ser usado dentro de <DemoProvider>")
  }
  return ctx
}
