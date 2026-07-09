# Tasks — add-perfil-tecnico-carreira

## 0. Baseline
- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test`
  (guardar contagem de testes) — verde final = zero falhas novas vs. baseline.
  (Zero DDL nesta change → `pnpm test:rls` deve permanecer igual ao baseline.)

## 1. Motor puro — `src/features/standings/coachStats.ts` (NOVO, sem IO)
- [ ] 1.0 `src/features/standings/insights.ts`: adicionar `export` a `resultadoDoLado`
  e ao tipo `ResultadoLado` (hoje privados do módulo) para reuso em `coachStats.ts` —
  NÃO reimplementar a regra de W.O. Ajuste trivial (não-DDL).
- [ ] 1.1 `partidaNaJanela(rodada: number | null, ini: number | null, fim: number
  | null): boolean` — predicado MEIO-ABERTO: `(ini==null || (rodada!=null &&
  rodada>=ini)) && (fim==null || (rodada!=null && rodada<fim))`. `rodada` NULL só
  passa quando `ini` e `fim` são nulos.
- [ ] 1.2 Tipos `Campanha { jogos, vitorias, empates, derrotas, golsPro, golsContra,
  saldo, aproveitamento }` e `PartidaCreditada { competitorId, lado: 1|2, placar_1,
  placar_2, woVencedorLado: 1|2|null, woDuplo }` (sem campo `wo`: `resultadoDoLado`
  deriva W.O. de `woDuplo`/`woVencedor`, não lê um `wo` de entrada — redundante).
- [ ] 1.3 `agregarCampanhaTecnico(partidas: PartidaCreditada[]): { total: Campanha,
  porClube: Map<string, Campanha> }` — reusa `resultadoDoLado` (NÃO reimplementa
  W.O.). **ATENÇÃO ao SHAPE:** `resultadoDoLado(p: PartidaCronoElegivel, lado)` lê
  `p.woVencedor` como ID comparado a `participante_1/2` (não como lado 1|2). Antes de
  chamar, sintetizar um shim `PartidaCronoElegivel`: `participante_1='1'`,
  `participante_2='2'`, `woVencedor = woVencedorLado===1?'1':woVencedorLado===2?'2':null`,
  `status='encerrada'`, `placar_1/2` reais, `woDuplo`; e passar `lado` como
  `String(lado)`. Soma por `competitorId` e no total; `saldo = golsPro - golsContra`;
  `aproveitamento = jogos ? round((3*vitorias+empates)/(3*jogos)*100) : 0`. Garantir
  invariante: soma das fatias == total.
- [ ] 1.4 Testes puros: meio-aberto (fronteira da troca vai pro que ASSUMIU; jogo
  fora da janela fora); `rodada` NULL só em tenure aberta; W.O. simples (V/D, 0
  gols) e duplo (D/D, 0 gols); gol contra via placar contado; duas temporadas do
  mesmo clube somam na fatia; soma das fatias == total.

## 2. Fetcher da campanha — `src/features/league/data/getTecnicoCampanha.ts` (NOVO)
> Escopo é AUTOMÁTICO: as tenures do técnico só existem para vagas com
> `competitor_id` (temporada + mata-mata derivado). Copa/avulso/standalone não geram
> tenure, logo já ficam de fora sem filtro extra.
- [ ] 2.1 Ler `coach_tenures` do técnico (`user_id = userId`): `slot_id,
  competitor_id, rodada_inicio, rodada_fim`.
- [ ] 2.2 Ler `matches` das vagas dele (`.or(vaga_1.in.(slots),vaga_2.in.(slots))`,
  `status='encerrada'`): `id, vaga_1, vaga_2, placar_1, placar_2, rodada, wo,
  wo_vencedor, wo_duplo`.
- [ ] 2.3 Resolver lado + janela por partida (usa `partidaNaJanela` contra a tenure
  da vaga do técnico); descartar partida sem tenure-vaga cuja janela contenha a
  rodada; `woVencedorLado` = 1|2|null a partir de `wo_vencedor` vs `vaga_1/2`.
  Produzir `PartidaCreditada[]`.
- [ ] 2.4 Adversários enfrentados: coletar as vagas OPOSTAS das partidas creditadas,
  ler suas `coach_tenures` (`.in(slot_id, vagasOpostas)`), resolver o técnico do lado
  oposto por janela (mesmo predicado), coletar `user_id` distintos (≠ userId, ≠
  nulo) com contagem de jogos, buscar `nome, avatar` em `users_public`. Retornar
  `adversarios: { userId, nome, avatar, jogos }[]` desc por jogos.
- [ ] 2.5 Retornar `{ total, porClube, adversarios }` (tipos exportados). Degradar
  para vazio em erro de IO (não quebrar a página).
- [ ] 2.6 Testes (mock): credita o lado certo; NÃO credita fora da janela; split
  soma na mesma fatia; adversário sem conta fora da lista.

## 3. Fetcher do confronto — `src/features/league/data/getConfrontoTecnicos.ts` (NOVO)
- [ ] 3.1 Ler tenures de A e de B (vagas + janelas). Auto-confronto (A==B) → vazio.
- [ ] 3.2 Ler `matches` das vagas de A (`status='encerrada'`, campos de placar/W.O.
  + `rodada`); manter só as em que o lado OPOSTO é vaga de B.
- [ ] 3.3 Manter a partida só se `rodada` cai na janela de A (vaga de A) E na de B
  (vaga de B). Re-chavear lados como `"A"`/`"B"` (respeitando `wo_vencedor`) e chamar
  `confrontoDireto("A","B", partidas, ordenar)`.
- [ ] 3.4 Testes (mock): conta só jogos nas DUAS janelas; jogo fora da janela de B
  não conta; W.O. respeitado.

## 4. Perfil (identidade) — `getTecnicoProfile.ts`
- [ ] 4.1 `select` inclui `avatar`; tipo `TecnicoPerfil` ganha `avatar: string |
  null`. Sem mudança de comportamento além disso.

## 5. Server Action — `src/actions/insights.ts`
- [ ] 5.1 `carregarConfrontoTecnicos(userAId: string, userBId: string)` — POST,
  valida os dois uuids (retorno vazio se inválido ou A==B), chama
  `getConfrontoTecnicos`, retorna o retrospecto. ADITIVA (não altera
  `carregarConfrontoDireto`).
- [ ] 5.2 Testes (mock): uuid inválido → vazio; A==B → vazio; delega ao fetcher.

## 6. UI
- [ ] 6.1 `CampanhaDeSempre.tsx` (NOVO, RSC): bloco com Jogos, V-E-D, GP, GC, Saldo,
  Aproveitamento; estado vazio quando `total.jogos === 0`. Responsivo 390px+, 2
  temas (paleta Dracula/Canarinho; sem cores hardcoded fora dos tokens).
- [ ] 6.2 `ClubesComandados.tsx`: cada linha recebe a fatia (`porClube.get(competitorId)`)
  e exibe `J · V-E-D · GP:GC · SG` sem estourar no mobile (44px de toque preservado).
- [ ] 6.3 `TecnicoHero.tsx`: passar `avatar` ao `UserAvatar` (foto real; iniciais no
  fallback). Manter os chips atuais.
- [ ] 6.4 `ConfrontoTecnicosPanel.tsx` (NOVO, `"use client"`): espelha
  `ConfrontoDiretoPanel` — seletor com `adversarios`, chama `carregarConfrontoTecnicos`
  sob demanda, render do agregado + lista de jogos; ícone `Swords`. Vazio quando não
  há adversários.
- [ ] 6.5 `page.tsx` do técnico: buscar `getTecnicoCampanha` (junto de
  `getTecnicoProfile`/`getConquistasDoTecnico`), montar `CampanhaDeSempre` +
  passar `porClube` ao `ClubesComandados` + `ConfrontoTecnicosPanel`. Ordem/hierarquia
  visual coerente (herói → campanha de sempre → clubes → confronto → hall da fama).

## 7. Gate
- [ ] 7.1 `openspec validate add-perfil-tecnico-carreira --strict` = valid.
- [ ] 7.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline);
  `pnpm test:rls` igual ao baseline (zero DDL).
- [ ] 7.3 `pnpm build` verde.
- [ ] 7.4 Validação visual 390px + desktop, 2 temas (campanha de sempre; fatia por
  clube; confronto entre técnicos; foto real). Requer login (pendência do dono se o
  agente não puder logar).
