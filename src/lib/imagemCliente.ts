/**
 * Redução de imagem no CLIENTE, antes do upload (change escudo-personalizado-liga).
 *
 * Por que existe: o bucket `escudos` tem `file_size_limit` de 256KB e uma foto de
 * celular tem 2-5MB. Sem reduzir, a feature simplesmente não funcionaria pelo
 * celular — que é o caso de uso do dono. O canvas resolve três coisas de uma vez:
 * tamanho, normalização de formato (qualquer entrada vira PNG/WEBP) e remoção de
 * EXIF/GPS **por construção** (o canvas re-encoda só os pixels; nenhum metadado
 * sobrevive).
 *
 * NÃO é controle de segurança — cliente é burlável. O servidor revalida bytes,
 * tipo e tamanho (`src/lib/escudoCustom.ts`) e o bucket é o terceiro anteparo.
 */

/** Escudo é desenhado no máximo a ~64px; 256 dá folga para telas 3x. */
const LADO = 256
/** Margem sobre o limite de 256KB do bucket. */
const TETO_BYTES = 240 * 1024

export type ReducaoImagem =
  | { ok: true; file: File }
  | { ok: false; error: string }

function carregar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("decode"))
    }
    img.src = url
  })
}

function paraBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, 0.92))
}

/**
 * Reduz a imagem para um quadrado de 256px preservando a proporção (contain, sem
 * cortar e sem esticar) sobre fundo transparente. Tenta WEBP primeiro (bem menor);
 * se o navegador não suportar, cai em PNG.
 */
export async function reduzirParaEscudo(file: File): Promise<ReducaoImagem> {
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "Selecione um arquivo de imagem." }
  }
  // SVG não é rasterizável com segurança aqui (e o bucket não o aceita).
  if (file.type === "image/svg+xml") {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WEBP." }
  }

  let img: HTMLImageElement
  try {
    img = await carregar(file)
  } catch {
    return { ok: false, error: "Não foi possível ler esta imagem." }
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    return { ok: false, error: "Não foi possível ler esta imagem." }
  }

  const canvas = document.createElement("canvas")
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext("2d")
  if (!ctx) return { ok: false, error: "Não foi possível processar a imagem." }

  const escala = Math.min(LADO / img.naturalWidth, LADO / img.naturalHeight)
  const w = Math.max(1, Math.round(img.naturalWidth * escala))
  const h = Math.max(1, Math.round(img.naturalHeight * escala))
  ctx.drawImage(img, Math.round((LADO - w) / 2), Math.round((LADO - h) / 2), w, h)

  // `toBlob` devolve PNG quando o mime pedido não é suportado — daí conferir o
  // tipo do blob, não só a ausência de erro.
  let blob = await paraBlob(canvas, "image/webp")
  if (!blob || blob.type !== "image/webp") {
    blob = await paraBlob(canvas, "image/png")
  }
  if (!blob) return { ok: false, error: "Não foi possível processar a imagem." }
  if (blob.size > TETO_BYTES) {
    return { ok: false, error: "Não foi possível reduzir esta imagem. Tente outra." }
  }

  const ext = blob.type === "image/webp" ? "webp" : "png"
  return {
    ok: true,
    file: new File([blob], `escudo.${ext}`, { type: blob.type }),
  }
}
