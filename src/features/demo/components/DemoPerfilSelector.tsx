"use client"

import {
  PERFIS_DEMO,
  ROTULO_PERFIL,
  type PerfilDemo,
} from "@/features/demo/store/perfil"
import { useDemoStore } from "@/features/demo/store/useDemoStore"

/**
 * Troca o PERFIL FICTÍCIO (só permissões de INTERFACE — nunca cria sessão nem
 * chama endpoint). `<select>` nativo: acessível por teclado e leve.
 */
export function DemoPerfilSelector() {
  const { state, dispatch } = useDemoStore()

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Perfil simulado</span>
      <select
        value={state.perfil}
        onChange={(e) =>
          dispatch({ type: "TROCAR_PERFIL", perfil: e.target.value as PerfilDemo })
        }
        aria-label="Trocar perfil simulado"
        className="h-9 rounded-md border border-amber-500/40 bg-background/60 px-2 text-base text-foreground md:h-7 md:text-xs focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
      >
        {PERFIS_DEMO.map((p) => (
          <option key={p} value={p}>
            {ROTULO_PERFIL[p]}
          </option>
        ))}
      </select>
    </label>
  )
}
