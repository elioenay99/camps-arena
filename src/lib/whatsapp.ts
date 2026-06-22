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
  return `${saudacao} Bora jogar nossa partida do ${torneio} no Goliseu? ${url}`
}

/** Um lado de um confronto para o texto da rodada. */
export interface LadoRodadaTexto {
  /** Nome do clube (ou competidor por-nome). */
  clube: string
  /** Nome do comandante (técnico da vaga); null = vaga órfã/por-nome (⇒ ❌). */
  comandante?: string | null
  /** Celular do comandante; vira link wa.me embutido quando válido. */
  celular?: string | null
}

/**
 * Texto do anúncio de uma rodada para o WhatsApp (change add-compartilhar-rodada).
 * Cabeçalho "<título> — Nª rodada Liberada" + um confronto por linha (clube +
 * comandante; com o link `wa.me` do comandante quando há celular — decisão do dono;
 * sem comandante ⇒ ❌) SEPARADOS POR LINHA EM BRANCO (legibilidade no WhatsApp) + a
 * URL absoluta da página. Sem emoji decorativo (o ❌ é caractere unicode estável e
 * desejado). Montado no SERVIDOR — o celular entra só embutido no `wa.me`.
 */
export function mensagemRodada({
  titulo,
  rodada,
  confrontos,
  tournamentId,
}: {
  titulo?: string | null
  rodada: number
  confrontos: { lado1: LadoRodadaTexto; lado2: LadoRodadaTexto }[]
  tournamentId: string
}): string {
  const t = titulo?.trim() || "Campeonato"
  const url = `${env.NEXT_PUBLIC_SITE_URL}/dashboard/torneios/${tournamentId}`
  const lado = (l: LadoRodadaTexto): string => {
    const nome = l.comandante?.trim()
    if (!nome) return `${l.clube} (❌)`
    const wa = linkWhatsApp(l.celular)
    return wa ? `${l.clube} (${nome}: ${wa})` : `${l.clube} (${nome})`
  }
  const linhas = confrontos.map((c) => `${lado(c.lado1)} x ${lado(c.lado2)}`).join("\n\n")
  const corpo = linhas ? `${linhas}\n\n` : ""
  return `${t} — ${rodada}a rodada Liberada\n\n${corpo}Acompanhe: ${url}`
}
