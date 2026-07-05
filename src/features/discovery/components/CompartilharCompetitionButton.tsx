"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { compartilharWhatsApp } from "@/lib/compartilharWhatsApp"

/**
 * Compartilhar o link canônico de uma competição (liga ou torneio) — change
 * add-vitrine-publica-e-compartilhar. Só o LINK (sem imagem, diferente do botão
 * da rodada): reusa a orquestração única `compartilharWhatsApp` (Web Share no
 * celular, copiar no desktop) sem `getFile`. A URL ABSOLUTA é montada no cliente
 * (`window.location.origin` + path) — o Web Share exige URL absoluta. Renderizado
 * só a quem gere (gate na página).
 */
export function CompartilharCompetitionButton({
  path,
  titulo,
}: {
  /** Caminho canônico da página (ex.: `/dashboard/torneios/<id>`). */
  path: string
  titulo: string
}) {
  const [pendente, setPendente] = useState(false)

  async function aoClicar() {
    if (pendente) return
    setPendente(true)
    try {
      const url =
        typeof window !== "undefined" ? `${window.location.origin}${path}` : path
      await compartilharWhatsApp({ texto: `${titulo}\n${url}`, title: titulo })
    } finally {
      setPendente(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-11 rounded-full px-4"
      disabled={pendente}
      onClick={aoClicar}
    >
      <Share2 aria-hidden="true" />
      {pendente ? "Preparando…" : "Compartilhar"}
    </Button>
  )
}
