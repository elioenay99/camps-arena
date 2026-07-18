import Link from "next/link"

import { DemoLigaView } from "@/features/demo/components/DemoLigaView"
import { PIRAMIDE } from "@/features/demo/fixtures/piramide"

export default async function DemoLigaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (id !== PIRAMIDE.id) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">
        Pirâmide não encontrada nesta demonstração.{" "}
        <Link href="/demo/ligas" className="text-primary hover:underline">
          Ver pirâmides
        </Link>
      </div>
    )
  }
  return <DemoLigaView />
}
