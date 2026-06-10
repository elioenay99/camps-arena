import { OG_ALT, OG_CONTENT_TYPE, OG_SIZE, renderBrandOg } from "@/features/og/brand"

// Card OG estático da marca, na RAIZ → herdado por todas as rotas (landing,
// login, cadastro, convite). Sem dados de request: prerenderizado no build.
export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderBrandOg()
}
