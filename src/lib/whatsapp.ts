import { env } from "@/lib/env"

/**
 * Link wa.me a partir de um celular — fonte ÚNICA do atalho de contato (modal,
 * card do dashboard e listas da página do torneio). Reconhece dois mundos:
 *  - E.164 (com `+`): o DDI já está embutido → `wa.me/<DDI><numero>` (8–15
 *    dígitos). Cobre qualquer país (`+351…`, `+1…`). O valor gravado pelo schema
 *    já é E.164 válido (autoridade de validade); aqui só se confia nele.
 *  - Legado brasileiro (sem `+`): 11 dígitos recebem o DDI 55; 13 dígitos
 *    iniciando em 55 entram diretos (o DDI é inferido pelo COMPRIMENTO, não pelo
 *    prefixo — um DDD 55 não é DDI).
 * Qualquer outro formato → null (sem atalho).
 */
export function linkWhatsApp(
  celular?: string | null,
  texto?: string
): string | null {
  if (!celular) return null
  const bruto = celular.trim()
  const digitos = bruto.replace(/\D/g, "")
  let alvo: string | null = null
  if (bruto.startsWith("+")) {
    if (digitos.length >= 8 && digitos.length <= 15) alvo = digitos
  } else if (digitos.length === 11) {
    alvo = `55${digitos}`
  } else if (digitos.length === 13 && digitos.startsWith("55")) {
    alvo = digitos
  }
  if (!alvo) return null
  const base = `https://wa.me/${alvo}`
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

/** Um time na lista de times para o texto de compartilhamento. */
export interface TimeListaTexto {
  /** Nome do clube (ou competidor por-nome). */
  clube: string
  /** Nome do técnico (comandante da vaga); null = vaga aberta/por-nome (⇒ ❌). */
  comandante?: string | null
  /** Celular do técnico; vira link wa.me embutido quando válido. */
  celular?: string | null
}

/**
 * Texto da LISTA DE TIMES de um torneio competitivo para o WhatsApp (change
 * add-compartilhar-lista-times) — "app prepara, você envia", SEM imagem. Cabeçalho
 * "<título> — Times" + UMA LINHA por time (clube + técnico; com o link `wa.me` do técnico
 * quando há celular; técnico sem celular sai só com o nome; time SEM técnico ⇒ ❌) SEPARADAS
 * por uma quebra simples (lista plana e compacta, ≠ confrontos da rodada) + a URL absoluta
 * da página. Mesma regra de ❌ da rodada (só quando não há técnico). Sem emoji decorativo (o
 * ❌ é unicode estável e desejado). Montado no SERVIDOR — o celular entra só embutido no
 * `wa.me`, nunca cru no client.
 */
export function mensagemListaTimes({
  titulo,
  times,
  tournamentId,
}: {
  titulo?: string | null
  times: TimeListaTexto[]
  tournamentId: string
}): string {
  const t = titulo?.trim() || "Campeonato"
  const url = `${env.NEXT_PUBLIC_SITE_URL}/dashboard/torneios/${tournamentId}`
  const linha = (time: TimeListaTexto): string => {
    const nome = time.comandante?.trim()
    if (!nome) return `${time.clube} — ❌`
    const wa = linkWhatsApp(time.celular)
    return wa ? `${time.clube} — ${nome}: ${wa}` : `${time.clube} — ${nome}`
  }
  const linhas = times.map(linha).join("\n")
  const corpo = linhas ? `${linhas}\n\n` : ""
  return `${t} — Times\n\n${corpo}Veja: ${url}`
}
