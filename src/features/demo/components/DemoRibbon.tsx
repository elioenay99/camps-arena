"use client"

import Link from "next/link"
import { RotateCcw, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ROTULO_PERFIL } from "@/features/demo/store/perfil"
import { useDemoStore } from "@/features/demo/store/useDemoStore"

import { DemoPerfilSelector } from "./DemoPerfilSelector"

/**
 * Faixa permanente do modo demonstração — identidade visual distinta do app real
 * (fundo âmbar), aviso de dados fictícios, seletor de perfil simulado e as ações
 * globais "Reiniciar demonstração" e "Entrar e usar o Goliseu".
 */
export function DemoRibbon() {
  const { state, reiniciar } = useDemoStore()

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100">
      <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-1.5 text-xs sm:gap-y-2 sm:px-6 sm:py-2">
        <span className="flex items-center gap-1.5 font-medium">
          <Sparkles aria-hidden className="size-3.5 text-amber-600 dark:text-amber-400" />
          Modo demonstração
        </span>
        {/* O aviso ENCURTA no mobile, nunca some: a frase completa mede ~468px
            em 342px úteis, quebrava em duas linhas e ajudava a faixa a comer
            ~185px da primeira dobra. Transparência de que os dados são
            fictícios é obrigação da demo — por isso encurta, e não recolhe. */}
        <span className="text-amber-900/80 sm:hidden dark:text-amber-100/70">
          Dados fictícios
        </span>
        <span className="hidden text-amber-900/80 sm:inline dark:text-amber-100/70">
          Todos os dados são fictícios e nenhuma alteração será enviada ao sistema
          real.
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span
            className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-medium"
            aria-label={`Perfil simulado: ${ROTULO_PERFIL[state.perfil]}`}
          >
            {ROTULO_PERFIL[state.perfil]}
          </span>
          <DemoPerfilSelector />
          <Button
            size="sm"
            variant="ghost"
            onClick={reiniciar}
            aria-label="Reiniciar demonstração"
            className="text-amber-950 hover:bg-amber-500/20 dark:text-amber-100"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            {/* Rótulos encurtam no mobile para as ações caberem numa faixa só.
                O nome acessível completo fica no aria-label. */}
            <span className="sm:hidden">Reiniciar</span>
            <span className="hidden sm:inline">Reiniciar demonstração</span>
          </Button>
          <Button size="sm" variant="default" asChild>
            <Link href="/login" aria-label="Entrar e usar o Goliseu">
              <span className="sm:hidden">Entrar</span>
              <span className="hidden sm:inline">Entrar e usar o Goliseu</span>
            </Link>
          </Button>
        </span>
      </div>
    </div>
  )
}
