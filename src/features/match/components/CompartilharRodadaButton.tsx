"use client"

import { Share2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"

/**
 * Compartilhar a rodada no WhatsApp (change add-compartilhar-rodada) — "app
 * prepara, você envia". No celular usa a Web Share API (`canShare({files})` →
 * `share`) para mandar a imagem + texto a um grupo em um toque. No desktop (sem
 * share de arquivo) cai no fallback: copia o texto, baixa o PNG e abre `wa.me`.
 * O `texto` é montado no servidor (o celular só entra embutido nos links wa.me).
 */
export function CompartilharRodadaButton({
  tournamentId,
  rodada,
  titulo,
  texto,
}: {
  tournamentId: string
  rodada: number
  titulo: string
  texto: string
}) {
  const [pendente, setPendente] = useState(false)
  const title = `${titulo} — Rodada ${rodada}`
  const imagemUrl = `/dashboard/torneios/${tournamentId}/rodada/${rodada}/imagem`

  async function baixarImagem(): Promise<File | null> {
    try {
      const res = await fetch(imagemUrl, { credentials: "same-origin" })
      if (!res.ok) return null
      const blob = await res.blob()
      return new File([blob], `rodada-${rodada}.png`, { type: "image/png" })
    } catch {
      return null
    }
  }

  function fallbackDesktop(file: File | null, janela: Window | null) {
    void navigator.clipboard
      ?.writeText(texto)
      .then(() => toast.success("Texto copiado. Cole no WhatsApp."))
      .catch(() => toast.message("Copie o texto manualmente."))
    if (file) {
      const href = URL.createObjectURL(file)
      const a = document.createElement("a")
      a.href = href
      a.download = file.name
      a.click()
      URL.revokeObjectURL(href)
    }
    const waUrl = `https://wa.me/?text=${encodeURIComponent(texto)}`
    if (janela) janela.location.href = waUrl
    else window.open(waUrl, "_blank", "noopener")
  }

  async function compartilhar() {
    if (pendente) return
    setPendente(true)
    // Abre a aba ANTES dos awaits: popup-blocker desktop bloqueia window.open
    // disparado após await. Só é usada no fallback; fechada se o share nativo rolar.
    // SEM "noopener" no pré-open: com noopener o window.open retorna null (por
    // spec), perdendo a referência da aba — então severamos o opener à mão,
    // mantendo a referência para redirecionar a aba ao wa.me dentro do gesto.
    const podeShareNativo =
      typeof navigator !== "undefined" && typeof navigator.share === "function"
    const janela = podeShareNativo ? null : window.open("about:blank", "_blank")
    if (janela) janela.opener = null
    try {
      const file = await baixarImagem()
      const comArquivo =
        file != null &&
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      const dados: ShareData = comArquivo
        ? { files: [file], text: texto, title }
        : { text: texto, title }

      if (podeShareNativo && (navigator.canShare?.(dados) ?? true)) {
        try {
          await navigator.share(dados)
          janela?.close()
        } catch (e) {
          // Cancelamento do usuário não é erro.
          if ((e as Error)?.name !== "AbortError") fallbackDesktop(file, janela)
          else janela?.close()
        }
      } else {
        fallbackDesktop(file, janela)
      }
    } finally {
      setPendente(false)
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      className="rounded-full bg-green-700 text-white hover:bg-green-800"
      disabled={pendente}
      onClick={compartilhar}
    >
      <Share2 aria-hidden="true" />
      {pendente ? "Preparando…" : `Compartilhar rodada ${rodada}`}
    </Button>
  )
}
