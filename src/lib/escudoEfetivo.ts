/**
 * Escudo EFETIVO de um competidor (change escudo-personalizado-liga).
 *
 * `public.teams` é o catálogo GLOBAL de clubes reais, compartilhado por todas as
 * ligas e usuários. `league_competitors.escudo_url` é o override LOCAL daquela
 * pirâmide. A regra é uma só, e mora aqui: o override ganha; sem override, vale o
 * catálogo; sem os dois, `null` (as superfícies caem no monograma de iniciais do
 * `TeamCrest`).
 *
 * O que se repete pelos fetchers é o `select` (um embed de um hop via
 * `tournament_slots.competitor_id` / `cup_entries.competitor_id`), NÃO a decisão —
 * ver `openspec/changes/escudo-personalizado-liga/design.md`. Se a regra mudar,
 * muda aqui e os call sites seguem.
 *
 * `undefined` é tratado como ausência: o embed do PostgREST vem `null`, mas a
 * fronteira `as unknown as {...}` de cada fetcher pode entregar `undefined` quando
 * o campo não foi pedido.
 */
export function escudoEfetivo(
  custom: string | null | undefined,
  doCatalogo: string | null | undefined,
): string | null {
  return custom ?? doCatalogo ?? null
}
