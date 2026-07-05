# Tasks — add-escudo-artilharia

## 0. Baseline
- [x] 0.1 Baseline HEAD: `pnpm typecheck && pnpm lint && pnpm test` verdes
  (1486 testes). Verde final = igual ao baseline (zero regressão).

## 1. Camada de dados — `getArtilharia.ts`
- [x] 1.1 Select de `tournament_slots`: `team:teams ( nome, escudo_url )`.
- [x] 1.2 `InfoVaga` ganha `escudoUrl: string | null`; tipar o embed como
  `{ nome: string | null; escudo_url: string | null }` e tomar o escudo do slot.
- [x] 1.3 `ArtilhariaLinha` ganha `escudoUrl: string | null`; propagar do
  `InfoVaga` (via `acc`) até o retorno.

## 2. UI — `ArtilhariaRanking.tsx`
- [x] 2.1 `<TeamCrest nome={linha.competitorNome} escudoUrl={linha.escudoUrl} size={28} />`.
- [x] 2.2 Ajustar o comentário do JSDoc que afirma "Sem escudo real no shape".

## 3. Página do competidor — verificação
- [x] 3.1 Confirmar que `CompetidorArtilheiros` não usa `TeamCrest`/monograma por
  linha e que o escudo real já aparece no `CompetidorHero` → sem alteração.

## 4. Testes
- [x] 4.1 `getArtilharia.test.ts`: incluir `escudo_url` nos slots mockados e
  `escudoUrl` nas linhas esperadas; caso por-nome/avulso → `escudoUrl` null.

## 5. Gate
- [x] 5.1 `openspec validate add-escudo-artilharia --strict` = VALID.
- [x] 5.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes.
