# Tasks — add-onboarding-primeiro-campeonato

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test` —
  registrar contagem verde (verde final = zero falhas novas vs. baseline).

## 1. Estado-vazio ciente de contexto (`EmptyActiveMatches`)

- [ ] 1.1 Dar props ao `src/features/match/components/EmptyActiveMatches.tsx`:
  `{ semTorneios: boolean; temAvulsoAberto: boolean }` (default seguro se ausente =
  comportamento atual não é obrigatório; o dashboard sempre passa os flags).
- [ ] 1.2 Estado 1 — SEM NENHUM torneio (`semTorneios === true`): trocar o headline
  "Nenhuma partida ativa" por copy de BOAS-VINDAS orientada à ação (headline acolhedora
  + 1 linha curta "monta em 1 minuto"); esconder os dois CTAs atuais; renderizar UM
  único CTA primário com o texto EXATO **"Criar meu primeiro campeonato — leva 1 minuto"**
  → `/dashboard/torneios/novo`. NÃO renderizar "Nova partida".
- [ ] 1.3 Estado 2 — TEM torneio(s) mas SEM avulso aberto (`semTorneios === false &&
  temAvulsoAberto === false`): manter "Nenhuma partida ativa"; NÃO renderizar "Nova
  partida"; renderizar "Criar torneio" + link discreto "Ver meus torneios" →
  `/dashboard/torneios`.
- [ ] 1.4 Estado 3 — TEM avulso aberto (`temAvulsoAberto === true`): manter o
  comportamento atual — "Nova partida" (primária, → `/dashboard/partidas/nova`) +
  "Criar torneio". "Nova partida" SÓ aparece neste estado.
- [ ] 1.5 Preservar a11y e estilos existentes: ícones `lucide` `aria-hidden`,
  `:focus-visible`, alvo de toque ≥44px no mobile, `Button` `rounded-full`, `Link` do
  next, tokens semânticos (sem cor hardcoded), pt-BR.

## 2. Dashboard deriva os flags no servidor (`src/app/dashboard/page.tsx`)

- [ ] 2.1 No ramo `partidas.length === 0`, buscar os torneios do usuário via
  `getMeusTorneios(user.id)` → `{ organizo, participo }` e derivar
  `semTorneios = organizo.length === 0 && participo.length === 0`.
- [ ] 2.2 Derivar `temAvulsoAberto` via `getOwnTournaments(user.id)` (`length > 0`).
- [ ] 2.3 Passar `semTorneios` e `temAvulsoAberto` como props ao `<EmptyActiveMatches />`.
  Manter a página como Server Component (sem `"use client"` novo); as buscas de torneios
  só rodam quando não há partida ativa.

## 3. Testes — 3 estados do estado-vazio

- [ ] 3.1 Criar teste do `EmptyActiveMatches` cobrindo os 3 estados:
  (a) `semTorneios` → mostra "Criar meu primeiro campeonato — leva 1 minuto", NÃO mostra
  "Nova partida";
  (b) com torneios mas sem avulso → mostra "Criar torneio" e "Ver meus torneios", NÃO
  mostra "Nova partida";
  (c) `temAvulsoAberto` → mostra "Nova partida" + "Criar torneio".
- [ ] 3.2 (Se existir teste de render do dashboard/estado-vazio, ajustar às props novas;
  `grep -rn EmptyActiveMatches src` para localizar consumidores.)

## 4. Gate de qualidade

- [ ] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (zero falhas
  novas vs. baseline).
- [ ] 4.2 Conferir os 3 estados na prática: conta nova (sem torneios) vê só o CTA de
  primeiro campeonato; com torneio sem avulso, sem "Nova partida"; com avulso aberto,
  fluxo atual.
