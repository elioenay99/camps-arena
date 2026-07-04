"use client"

import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

const STORAGE_KEY = "goliseu:standings-modo"

type Modo = "rolar" | "caber"

/**
 * Envolve a(s) `StandingsTable` e oferece dois modos de leitura no mobile:
 * "Rolar" (todas as stats com scroll horizontal — comportamento base) e "Caber
 * tudo" (compacto, cabe na largura da tela mantendo as 8 stats). A tabela (RSC
 * pura) reage ao `data-modo` deste wrapper via variantes
 * `group-data-[modo=caber]/standings:*` — um clique reconfigura grupos + geral
 * + clubes juntos, sem prop drilling.
 *
 * Estado inicial DETERMINÍSTICO (`rolar`) para não haver mismatch de hidratação;
 * a preferência (localStorage) e o default por viewport (matchMedia) só são
 * lidos após a hidratação, num efeito.
 */
export function ClassificacaoResponsiva({
  children,
}: {
  children: React.ReactNode
}) {
  const [modo, setModo] = useState<Modo>("rolar")

  useEffect(() => {
    const salvo = window.localStorage.getItem(STORAGE_KEY)
    if (salvo === "rolar" || salvo === "caber") {
      // Sync único pós-hidratação com a preferência salva — sem mismatch de SSR.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModo(salvo)
    } else {
      // Sem preferência: default por viewport. Guard defensivo p/ jsdom, que não
      // implementa matchMedia.
      const mql =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function"
          ? window.matchMedia("(max-width: 640px)")
          : null
      if (mql?.matches) {
        setModo("caber")
      }
    }

    // Sincroniza instâncias/abas quando a preferência muda em outra aba.
    function aoMudarStorage(e: StorageEvent) {
      if (
        e.key === STORAGE_KEY &&
        (e.newValue === "rolar" || e.newValue === "caber")
      ) {
        setModo(e.newValue)
      }
    }
    window.addEventListener("storage", aoMudarStorage)
    return () => window.removeEventListener("storage", aoMudarStorage)
  }, [])

  function escolher(novo: Modo) {
    setModo(novo)
    try {
      window.localStorage.setItem(STORAGE_KEY, novo)
    } catch {
      // localStorage indisponível (modo privado/quota) — a escolha vale nesta
      // sessão, só não persiste.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Modo de exibição da classificação"
        className="ml-auto inline-flex w-fit items-center gap-0.5 rounded-full border bg-muted/40 p-0.5 text-xs"
      >
        <button
          type="button"
          aria-pressed={modo === "rolar"}
          onClick={() => escolher("rolar")}
          className={cn(
            "rounded-full px-3 py-1.5 font-medium transition-colors",
            modo === "rolar"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Rolar
        </button>
        <button
          type="button"
          aria-pressed={modo === "caber"}
          onClick={() => escolher("caber")}
          className={cn(
            "rounded-full px-3 py-1.5 font-medium transition-colors",
            modo === "caber"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Caber tudo
        </button>
      </div>
      <div className="group/standings flex flex-col gap-6" data-modo={modo}>
        {children}
      </div>
    </div>
  )
}
