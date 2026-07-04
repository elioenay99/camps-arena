"use client"

import { useEffect, useState } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export type AbaTorneio = {
  value: string
  label: string
  /** Ícone JÁ RENDERIZADO (elemento), nunca o componente — funções não cruzam a fronteira RSC→client. */
  icon: React.ReactNode
  content: React.ReactNode
  /** Rótulo curto, exibido só no mobile (ex.: "Class." para "Classificação"). */
  labelCurto?: string
  /** Contador opcional (ex.: itens pendentes que pedem ação). */
  badge?: number
  /** Mantém o conteúdo montado p/ preservar estado aninhado (ex.: a rodada do passador). */
  forceMount?: boolean
}

/**
 * Abas da página de detalhe do torneio. A RSC carrega os dados e aplica TODOS os
 * gates; aqui só apresentamos os nós já renderizados (sem dados crus, sem PII).
 * A troca é client-side (sem refetch). O estado da aba sobrevive à revalidação
 * das actions porque o wrapper permanece montado.
 */
export function TournamentTabs({
  abas,
  padrao,
}: {
  abas: AbaTorneio[]
  padrao: string
}) {
  const valores = abas.map((a) => a.value)
  const [valor, setValor] = useState(padrao)

  // Deep-link por hash (ex.: notificação push aponta p/ ...#partidas): lido UMA
  // vez após a hidratação (sem mismatch de SSR). Só aplica se a aba existe.
  useEffect(() => {
    const alvo = window.location.hash.replace(/^#/, "")
    if (alvo && valores.includes(alvo)) {
      // Sync único pós-hidratação com a URL — não é estado derivado de props.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValor(alvo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Clamp: abas são dinâmicas — se a aba ativa sumiu (ex.: liberou a última
  // rodada e "Rodadas" deixou de existir), cai p/ o padrão (sempre presente),
  // evitando o painel-fantasma em branco do Radix.
  const ativo = valores.includes(valor) ? valor : padrao

  return (
    <Tabs value={ativo} onValueChange={setValor}>
      <TabsList aria-label="Seções do torneio">
        {abas.map((a) => (
          <TabsTrigger
            key={a.value}
            value={a.value}
            className="flex-col gap-1 sm:flex-row sm:gap-2"
          >
            {/* Ícone + badge numa linha só (evita 3 linhas no mobile). */}
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className="[&_svg]:size-4">
                {a.icon}
              </span>
              {a.badge ? (
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                  {a.badge}
                  <span className="sr-only"> pendente(s)</span>
                </span>
              ) : null}
            </span>
            {/* Rótulo curto: só visual, só no mobile. */}
            <span
              aria-hidden="true"
              className="text-[11px] leading-none font-medium sm:hidden"
            >
              {a.labelCurto ?? a.label}
            </span>
            {/* Nome acessível SEMPRE presente (sr-only), visível no desktop.
                NUNCA `hidden`: removeria o nome do a11y tree no mobile. */}
            <span className="sr-only sm:not-sr-only">{a.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {abas.map((a) => (
        <TabsContent
          key={a.value}
          value={a.value}
          forceMount={a.forceMount || undefined}
        >
          {a.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
