/**
 * Gerador do código de convite de torneio. Aleatoriedade criptográfica
 * (`crypto.getRandomValues`) com alfabeto Crockford base32 minúsculo — sem
 * `i`, `l`, `o`, `u` (ambíguos ao ditar/transcrever o link). 32 símbolos
 * dividem 256 exatamente, então `byte % 32` é uniforme (sem viés de módulo).
 * 16 caracteres × 5 bits = 80 bits: impraticável de enumerar via
 * `/convite/[codigo]` ou `info_convite`.
 */
const ALFABETO_CONVITE = "0123456789abcdefghjkmnpqrstvwxyz"

export const TAMANHO_CODIGO_CONVITE = 16

export function gerarCodigoConvite(): string {
  const bytes = new Uint8Array(TAMANHO_CODIGO_CONVITE)
  crypto.getRandomValues(bytes)
  let codigo = ""
  for (const byte of bytes) {
    codigo += ALFABETO_CONVITE[byte % ALFABETO_CONVITE.length]
  }
  return codigo
}
