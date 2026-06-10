import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/features/og/brand"

// Mesmo card da marca para o Twitter/X (summary_large_image). Emite a tag
// twitter:image explícita, em vez de depender do fallback para og:image.
export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderBrandOg()
}
