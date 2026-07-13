import { env } from "@/lib/env"

/**
 * Helpers OG COMPARTILHADOS (change add-frente-compartilhavel) — extraídos de
 * `rodada.tsx`/`temporada.tsx` para servir os renderers novos (resultado,
 * classificação, técnico) sem duplicar o tema, o monograma nem — o que importa —
 * a allowlist anti-SSRF de escudos (a lição do SSRF de escudos já foi paga uma
 * vez; multiplicá-la é o risco real). As fontes/logo (`carregarAssets`/
 * `paraArrayBuffer`) NÃO se movem: continuam em `brand.tsx`.
 *
 * Refactor PURO, sem mudança de comportamento: `rodada.tsx`/`temporada.tsx`
 * reimportam daqui. Rede de segurança em `compartilhado.test.ts` (os
 * `route.test.ts` mockam os renderers e NÃO exercitam estes helpers).
 *
 * Satori suporta só flexbox + subset de CSS (sem grid; cores em hex, não oklch).
 */

// Tema base (Dracula) quando o campeonato não tem cor própria.
export const FUNDO = "#282a36"
export const FUNDO_CARD = "#343746"
export const ROXO = "#bd93f9"
export const VERDE = "#50fa7b"
export const VERMELHO = "#ff5555"
export const OURO = "#f1c40f"
export const TEXTO = "#f8f8f2"
export const TEXTO_SUAVE = "#abafd0"

/** Só hex de 6 dígitos entra no Satori (oklch/hex de 3 dígitos derrubam o render). */
export const HEX6 = /^#[0-9a-fA-F]{6}$/

/** Cor estável (HSL) para o monograma — replica TeamCrest (que é client). */
export function corDoNome(nome: string): string {
  let h = 0
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 45% 32%)`
}

export function inicial(nome: string): string {
  return [...nome.trim()][0]?.toUpperCase() ?? "?"
}

/** Corta nomes longos para não quebrar o layout. Satori não trunca por CSS de
 * forma confiável; cortamos no texto. Default 18 (comportamento herdado da rodada). */
export function cortar(nome: string, max = 18): string {
  const chars = [...nome]
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : nome
}

/**
 * Hosts confiáveis do escudo, para o fetch server-side (anti-SSRF). Espelha o
 * `csp.ts`/`next.config.ts`: CDN da api-sports (transição) + host EXATO do
 * Storage do projeto (derivado do env). `escudo_url` vem do banco, mas a RLS de
 * `teams` não valida a URL — sem esta allowlist, um dono de torneio poderia
 * gravar uma URL interna (ex.: metadata endpoint) e disparar SSRF cego por estas
 * rotas. Host fora da allowlist ⇒ cai no monograma (non-fatal).
 */
export const ESCUDO_HOSTS_CONFIAVEIS = new Set<string>([
  "media.api-sports.io",
  new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
])

/** Escudo remoto → data URL (timeout 2s, paralelizável). Falha ⇒ null (monograma). */
export async function escudoDataURL(url: string): Promise<string | null> {
  // Allowlist de host ANTES do fetch (anti-SSRF): URL malformada ou host fora
  // da lista ⇒ null (monograma).
  try {
    if (!ESCUDO_HOSTS_CONFIAVEIS.has(new URL(url).host)) return null
  } catch {
    return null
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = res.headers.get("content-type") ?? "image/png"
    return `data:${mime};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

/**
 * Escudo/foto (data URL) ou monograma colorido pelo nome — folha visual comum a
 * todos os cards OG. `lado` dimensiona o quadrado; a inicial escala com ele. */
export function Crest({
  nome,
  escudoData,
  lado,
}: {
  nome: string
  escudoData: string | null
  lado: number
}) {
  if (escudoData) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={escudoData} width={lado} height={lado} alt="" style={{ borderRadius: 12 }} />
    )
  }
  return (
    <div
      style={{
        display: "flex",
        width: lado,
        height: lado,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: corDoNome(nome),
        color: "#ffffff",
        fontSize: Math.round(lado * 0.48),
        fontWeight: 700,
      }}
    >
      {inicial(nome)}
    </div>
  )
}
