import { env } from "@/lib/env"

/**
 * Link wa.me a partir de um celular BR — fonte ÚNICA do atalho de contato
 * (modal, card do dashboard e lista da página do torneio). Aceita só celular
 * válido: 11 dígitos sem DDI (recebe o 55), ou 13 já com o DDI 55. Fixo ou
 * formato inválido → null (sem atalho). O DDI é inferido pelo COMPRIMENTO,
 * não pelo prefixo (um DDD 55 não é DDI).
 */
export function linkWhatsApp(
  celular?: string | null,
  texto?: string
): string | null {
  if (!celular) return null
  const digitos = celular.replace(/\D/g, "")
  let base: string | null = null
  if (digitos.length === 11) base = `https://wa.me/55${digitos}`
  if (digitos.length === 13 && digitos.startsWith("55")) {
    base = `https://wa.me/${digitos}`
  }
  if (!base) return null
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base
}

/**
 * Mensagem de convocação ("sua vez de jogar") com contexto e link da página
 * do torneio. Curta, sem emoji (codificação segura em qualquer handset);
 * fallbacks para nome/título ausentes. A URL é absoluta via
 * NEXT_PUBLIC_SITE_URL (sempre presente — default localhost em dev).
 */
export function mensagemConvocacao({
  adversario,
  titulo,
  tournamentId,
}: {
  adversario?: string | null
  titulo?: string | null
  tournamentId: string
}): string {
  const nome = adversario?.trim()
  const saudacao = nome ? `Fala, ${nome}!` : "Fala!"
  const torneio = titulo?.trim() || "nosso torneio"
  const url = `${env.NEXT_PUBLIC_SITE_URL}/dashboard/torneios/${tournamentId}`
  return `${saudacao} Bora jogar nossa partida do ${torneio} no Arena? ${url}`
}
