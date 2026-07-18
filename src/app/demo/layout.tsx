import type { Metadata } from "next"

import { StadiumBackdrop } from "@/components/stadium-backdrop"
import { DemoNav } from "@/features/demo/components/DemoNav"
import { DemoRibbon } from "@/features/demo/components/DemoRibbon"
import { DemoProvider } from "@/features/demo/store/DemoProvider"

export const metadata: Metadata = {
  title: "Demonstração — Goliseu",
  description:
    "Experimente o Goliseu com dados fictícios: placar interativo, classificação, rankings e mais — sem criar conta.",
  robots: { index: false, follow: true },
}

/**
 * Shell da demonstração pública. Herda tema/Toaster/fontes/nonce do root layout.
 * `DemoProvider` (client) segura o estado em memória; as páginas server são
 * passadas como `children`. NÃO usa `getPerfil`/supabase — 100% offline.
 */
export default function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DemoProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <StadiumBackdrop />
        <DemoNav />
        <DemoRibbon />
        <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-6">{children}</main>
      </div>
    </DemoProvider>
  )
}
