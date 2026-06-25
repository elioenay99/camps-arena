import { toast } from "sonner"

/** Busca o arquivo opcional a anexar no share nativo (ex.: PNG da rodada). */
export type ObterArquivo = () => Promise<File | null>

/**
 * Fallback desktop (ou onde a Web Share de arquivo não existe): copia o texto, baixa o
 * arquivo (se houver) e abre `wa.me`. A aba já pode ter sido pré-aberta no gesto (`janela`),
 * para escapar do popup-blocker que barra `window.open` após um await.
 */
function fallbackDesktop(texto: string, file: File | null, janela: Window | null) {
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

/**
 * Compartilhar no WhatsApp — "app prepara, você envia". FONTE ÚNICA do gesto (rodada com
 * imagem; lista de times text-only). No celular usa a Web Share API
 * (`navigator.canShare({ files })` → `share`) para mandar em um toque; no desktop (sem share
 * de arquivo) cai no fallback (copiar + baixar + `wa.me`). O `texto` é montado no SERVIDOR (o
 * celular só entra embutido nos links wa.me). `getFile` ausente ⇒ share text-only (a
 * negociação `canShare(dados) ?? true` preserva esse caminho). `AbortError` (cancelamento do
 * usuário) NÃO é tratado como erro.
 */
export async function compartilharWhatsApp({
  texto,
  title,
  getFile,
}: {
  texto: string
  title: string
  getFile?: ObterArquivo
}): Promise<void> {
  // Abre a aba ANTES dos awaits: popup-blocker desktop bloqueia window.open disparado após
  // await. Só é usada no fallback; fechada se o share nativo rolar. SEM "noopener" no
  // pré-open: com noopener o window.open retorna null (por spec), perdendo a referência da
  // aba — então severamos o opener à mão, mantendo a referência para redirecionar a aba ao
  // wa.me dentro do gesto.
  const podeShareNativo =
    typeof navigator !== "undefined" && typeof navigator.share === "function"
  const janela = podeShareNativo ? null : window.open("about:blank", "_blank")
  if (janela) janela.opener = null

  const file = getFile ? await getFile() : null
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
      if ((e as Error)?.name !== "AbortError") fallbackDesktop(texto, file, janela)
      else janela?.close()
    }
  } else {
    fallbackDesktop(texto, file, janela)
  }
}
