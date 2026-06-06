/**
 * Inteiro uniforme em [0, n) com aleatoriedade criptográfica e SEM viés de
 * módulo (rejection sampling — mesma preocupação do invite-code, que escolheu
 * alfabeto divisor de 256). Implementa o contrato `RandInt` do motor de
 * chaveamento; os testes do motor injetam um gerador determinístico.
 */
export function randIntCrypto(n: number): number {
  if (!Number.isInteger(n) || n < 1 || n > 256) {
    throw new Error(`randIntCrypto: n fora do suportado (1..256): ${n}`)
  }
  // Rejeita a cauda de 256 que não divide n (ex.: n=6 → aceita 0..251).
  const limite = Math.floor(256 / n) * n
  const byte = new Uint8Array(1)
  do {
    crypto.getRandomValues(byte)
  } while (byte[0] >= limite)
  return byte[0] % n
}
