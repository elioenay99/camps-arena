## 0. Fundação OG (refactor puro)

- [x] 0.1 Extrair `src/features/og/compartilhado.tsx` com `escudoDataURL`,
  `corDoNome`/monograma, `HEX6`, tema base e `ESCUDO_HOSTS_CONFIAVEIS` de
  `rodada.tsx`/`temporada.tsx` (as fontes/logo `carregarAssets`/`paraArrayBuffer`
  ficam em `brand.tsx`, não se movem). Reimportar em `rodada.tsx` e `temporada.tsx`.
- [x] 0.2 Rede de segurança do refactor: `compartilhado.test.ts` NOVO testando os
  helpers diretamente (host fora da allowlist ⇒ null; `HEX6` rejeita oklch/3-dígitos;
  `corDoNome` determinístico) — os `route.test.ts` mockam os renderers e NÃO os
  exercitam. Validação visual: baixar o PNG de rodada e temporada antes/depois —
  idênticos.

## 1. Card OG de resultado da partida

- [x] 1.1 `getPartidaParaImagem(supabase, matchId)` — lê UMA `matches` por id sob RLS,
  projeta `tournament_id` e AMBOS os embeds: competitivo (`v1/v2` → escudo) e avulso
  (`p1/p2` → nome + `avatarUrl`, sem escudo). Ausente ⇒ null.
- [x] 1.2 `src/features/og/partida.tsx` (`renderPartidaOg`) — placar grande, escudos/
  foto/monogramas, selos derivados puros (GOLEADA `!wo && |dif|≥3`, W.O., W.O. DUPLO),
  tema por cores. Projeção de lado (competitivo × avulso) como função pura.
- [x] 1.3 Rota `torneios/[id]/partida/[matchId]/imagem/route.tsx` — auth-gated
  (sessão), sem posse; **exige `match.tournament_id === id`** (senão 404 sem oráculo);
  404 quando o fetcher retorna null.
- [x] 1.4 `mensagemResultado(...)` em `src/lib/whatsapp.ts`.
- [x] 1.5 `CompartilharResultadoButton` (client) no cluster de ações do
  `MatchHistoryList` (partida encerrada). Threading: `MatchHistoryList` passa a receber
  `tournamentId` (novo prop) a partir de `torneios/[id]/page.tsx`; `mensagemResultado`
  montada no RSC e passada como texto pronto (espelha `CompartilharRodadaButton`).
- [x] 1.6 Testes: rota (200/404/`tournament_id` divergente), mensagem pura, selos
  puros, projeção de lado (competitivo × avulso), botão (mock share).

## 2. Snapshot OG da classificação (torneio de liga + divisão de pirâmide)

- [x] 2.1 `src/features/og/classificacao.tsx` (`renderClassificacaoOg`) — linhas
  (pos/escudo|foto|monograma/nome/P/J/V/E/D/SG), faixas de zona opcionais, altura
  dinâmica + "+N". Usa `avatarUrl` no avulso quando houver.
- [x] 2.2 Rota torneio `torneios/[id]/classificacao/imagem/route.tsx` — auth-gated; só
  `formato === 'liga'`; `getTournamentClassificacao(id).linhas` (sem zonas).
- [x] 2.3 Rota liga `ligas/[id]/temporada/[seasonId]/divisao/[divisionSeasonId]/imagem/route.tsx`
  (segmento novo) — auth-gated; `getDivisionStandings(divisionSeasonId, userId,
  fronteiras)` e **LÊ `.zonas` do retorno** (não recomputa `derivarZonas`); cobre o
  split combinado.
- [x] 2.4 `mensagemClassificacao(...)` em `whatsapp.ts`.
- [x] 2.5 `CompartilharClassificacaoButton` junto ao `StandingsTable` no torneio de
  liga e em cada divisão da pirâmide. Formato de grupos fica de fora (frente futura).
- [x] 2.6 Testes: as duas rotas (200/404), mensagem, botão.

## 3. Celebração ativa do título + design-system

- [x] 3.1 Keyframes de burst com nome NOVO (ex.: `hs-burst`, sem colidir com
  `hs-confetti`), cor via CSS custom property, adicionados ao bloco
  `@media (prefers-reduced-motion: reduce)` de `globals.css`.
- [x] 3.2 `CelebracaoTitulo` (client) — burst one-shot ao montar sobre o destaque do
  campeão; checa `matchMedia('(prefers-reduced-motion: reduce)')` (reduzido ⇒ não
  monta); guard anti-repetição por id da chave (`sessionStorage`).
- [x] 3.3 Ancorar `CelebracaoTitulo` DENTRO do `BracketView` (RSC), adicionando só as
  props serializáveis `cor?` + `celebrarCampeao?` (sem cruzar JSX na fronteira RSC).
  `celebrarCampeao=true` só em final de torneio, final de copa e grande final de
  divisão; `false` em playoff/playout/barragem. Passar `cor` (via
  `resolverCoresTorneio`) nos call-sites: `torneios/[id]/page.tsx`,
  `copas/edicao/[id]/page.tsx`, `ligas/[id]/page.tsx`.
- [x] 3.4 Testes: opt-out por reduced-motion (mock `matchMedia`); dispara uma vez
  (guard); `celebrarCampeao=false` não dispara.

## 4. Wire do pôster de temporada órfão

- [x] 4.1 `mensagemTemporada(...)` em `whatsapp.ts`.
- [x] 4.2 `CompartilharTemporadaButton` na seção "fim de temporada" da liga (dono-only
  — rota existente `.../temporada/[seasonId]/imagem` inalterada).

## 5. Pôster pessoal do técnico

- [x] 5.1 `src/features/og/tecnico.tsx` (`renderTecnicoOg`) — avatar/foto, nome,
  campanha de sempre (J/V/E/D + aproveitamento) e troféus.
- [x] 5.2 Rota `ligas/tecnico/[userId]/imagem/route.tsx` — auth-gated;
  `getTecnicoProfile` (gate null ⇒ 404 sem oráculo + nome/foto), `getTecnicoCampanha`
  (campanha; `agregarCampanhaTecnico` é seu helper puro interno) e
  `getConquistasDoTecnico` (troféus).
- [x] 5.3 `mensagemTecnico(...)` em `whatsapp.ts`.
- [x] 5.4 `CompartilharTecnicoButton` no cabeçalho do perfil do técnico
  (`ligas/tecnico/[userId]/page.tsx`), exibido só quando há histórico (não gerar
  "pôster de nada").
- [x] 5.5 Testes: rota (200 com histórico / 404 perfil inexistente), mensagem, botão.

## 6. Integração e gate

- [x] 6.1 Confirmar que as 4 novas rotas retornam `image/png` funcionando SOB o proxy
  (como as rotas `.../imagem` existentes — o CSP no PNG é inócuo). NÃO editar
  `src/proxy.ts`.
- [x] 6.2 Regenerar tipos se necessário (não deve — zero DDL).
- [x] 6.3 Gate mecânico: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde
  (comparar com baseline do HEAD).
- [x] 6.4 Validação visual dos cards/pôsteres (baixar os PNG) + do burst de celebração
  em 390px, temas dark/light.
