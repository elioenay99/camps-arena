"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  )
}

/**
 * Faixa de abas. No mobile (390px) vira um segmented de colunas iguais
 * (`grid auto-cols-fr`): 2–4 abas cabem sem rolagem, sem classe dinâmica. No
 * desktop (`sm+`) volta a ser flex com rolagem horizontal para muitos rótulos.
 * A borda inferior dá o trilho; o gatilho ativo "senta" sobre ela.
 */
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "-mb-px grid auto-cols-fr grid-flow-col gap-1 border-b border-border sm:flex sm:items-stretch sm:overflow-x-auto sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Anel de foco INSET (não ring-offset): a TabsList rola na horizontal
        // (overflow-x-auto), o que recorta o eixo vertical — um anel projetado
        // p/ fora seria cortado em cima/embaixo. Inset desenha dentro da caixa.
        "group inline-flex min-h-11 items-center justify-center gap-2 border-b-2 border-transparent px-1 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[state=active]:border-primary data-[state=active]:text-foreground sm:shrink-0 sm:justify-start sm:px-3",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        "flex flex-col gap-6 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=inactive]:hidden",
        className
      )}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
