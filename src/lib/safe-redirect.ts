/**
 * Garante redirecionamento interno (anti open-redirect). Compartilhado entre
 * as Server Actions de auth e o route handler de confirmação de e-mail —
 * arquivos `"use server"` só exportam async, por isso o helper mora aqui.
 *
 * Não basta barrar o prefixo `//`: o parser WHATWG (e o roteador client do
 * Next) trata `\` como `/`, então `/\evil.com` resolveria para
 * `https://evil.com/`. Defesa: recusa `\` e caracteres de controle, exige
 * início em `/` (mas não `//`) e confirma que o destino resolvido permanece
 * na mesma origem antes de devolver `pathname + search + hash`.
 */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/dashboard"
): string {
  if (typeof value !== "string") return fallback
  // `\` vira `/` no parser; control chars (tab/CR/LF) são removidos e podem
  // mascarar um `//` — recusa ambos antes de qualquer parse.
  if (value.includes("\\") || hasControlChar(value)) return fallback
  if (!value.startsWith("/") || value.startsWith("//")) return fallback

  try {
    const base = "http://localhost"
    const url = new URL(value, base)
    // Qualquer destino que escape da origem-base é externo → fallback.
    if (url.origin !== base) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

/** True se houver byte de controle (U+0000–U+001F) — removidos pelo parser. */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) <= 0x1f) return true
  }
  return false
}
