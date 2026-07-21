import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `<select>` nativo do design system, espelhando o `<Input>`: mesma caixa, mesmo
 * anel de foco e o mesmo par mobile/desktop (`h-11 text-base` → `md:h-8
 * md:text-sm`). Os 16px no mobile são requisito, não estética: abaixo disso o
 * Safari/iOS amplia a página ao focar o campo e não desfaz o zoom.
 *
 * Continua sendo `<select>` nativo de propósito — abre a roleta do SO no mobile,
 * é acessível por teclado sem código e não tem armadilha de portal em `Dialog`.
 * Chamadas com densidade de desktop própria sobrescrevem via `className`.
 */
function SelectNative({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select-native"
      className={cn(
        "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none md:h-8 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export { SelectNative }
