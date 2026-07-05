"use client"

import { useEffect, useState } from "react"

import { StandingsModoProvider } from "@/features/standings/components/standingsModoContext"
import { deriveCompacto, deriveModoInicial, type Modo } from "@/features/standings/densidade"
import { cn } from "@/lib/utils"

const STORAGE_KEY = "goliseu:standings-modo"

/**
 * Envolve a(s) `StandingsTable` e oferece dois modos de leitura: "Rolar" (todas
 * as stats com scroll horizontal — base) e "Caber tudo" (compacto). O `modo`
 * controla a TIPOGRAFIA (via `data-modo`); a OCULTAÇÃO de colunas + o disclosure
 * por linha são função do estado COMPACTO — regra dura: só no MOBILE
 * (`compacto = viewportMobile && modo === 'caber'`). O desktop nunca é compacto:
 * todas as colunas ficam visíveis, mesmo em "caber". O `compacto` é publicado
 * para o CSS (`data-compacto`, oculta secundárias) e para o JS (contexto lido por
 * `StandingsRow` para renderizar o gatilho + a linha de detalhe).
 *
 * Estado inicial DETERMINÍSTICO (`modo='rolar'`, `viewportMobile=false` →
 * `compacto=false`) para não haver mismatch de hidratação; a preferência
 * (localStorage) e o viewport (matchMedia) só são lidos após a hidratação.
 */
export function ClassificacaoResponsiva({
  children,
}: {
  children: React.ReactNode
}) {
  const [modo, setModo] = useState<Modo>("rolar")
  const [viewportMobile, setViewportMobile] = useState(false)

  useEffect(() => {
    // Guard defensivo p/ jsdom, que não implementa matchMedia.
    const mql =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 640px)")
        : null
    const ehMobile = mql?.matches ?? false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewportMobile(ehMobile)

    const salvo = window.localStorage.getItem(STORAGE_KEY)
    if (salvo === "rolar" || salvo === "caber") {
      // Sync único pós-hidratação com a preferência salva — sem mismatch de SSR.
      setModo(salvo)
    } else {
      // Sem preferência: default por viewport (F3).
      setModo(deriveModoInicial(ehMobile))
    }

    // Reconcilia o viewport em resize/rotação (o compacto acompanha).
    function aoMudarViewport(e: MediaQueryListEvent) {
      setViewportMobile(e.matches)
    }
    mql?.addEventListener("change", aoMudarViewport)

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
    return () => {
      mql?.removeEventListener("change", aoMudarViewport)
      window.removeEventListener("storage", aoMudarStorage)
    }
  }, [])

  const compacto = deriveCompacto(viewportMobile, modo)

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
    // Desktop mais largo (F1): a partir de xl a classificação rompe o container
    // estreito da página (max-w-2xl) e centra num bloco mais largo (cap 80rem),
    // aproveitando a largura ociosa. Mobile/tablet ficam no fluxo normal.
    <div className="flex flex-col gap-4 xl:mx-[calc(50%-min(40rem,45vw))] xl:w-[min(80rem,90vw)]">
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
            "inline-flex min-h-11 items-center rounded-full px-3 py-1.5 font-medium transition-colors md:min-h-0",
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
            "inline-flex min-h-11 items-center rounded-full px-3 py-1.5 font-medium transition-colors md:min-h-0",
            modo === "caber"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Caber tudo
        </button>
      </div>
      <StandingsModoProvider value={{ compacto }}>
        <div
          className="group/standings flex flex-col gap-6"
          data-modo={modo}
          data-compacto={compacto}
        >
          {children}
        </div>
      </StandingsModoProvider>
    </div>
  )
}
