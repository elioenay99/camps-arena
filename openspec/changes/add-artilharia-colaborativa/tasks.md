# Tasks — add-artilharia-colaborativa

## 0. Baseline
- [x] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test`
  (guardar contagem de testes) — o verde final = zero falhas novas vs. baseline.

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`
- [x] 1.1 `match_goals`: `add column if not exists contra boolean not null default
  false`; `alter column jogador drop not null`.
- [x] 1.2 Trocar CHECK `match_goals_jogador_tam` por `match_goals_jogador_valido`
  (`(jogador not null e 1..60) or (jogador null e contra=true)`).
- [x] 1.3 Reprojetar o único em DOIS parciais: `match_goals_unico ... where
  contra=false` e `match_goals_contra_unico (… lower(btrim(coalesce(jogador,'')))) …
  where contra=true`.
- [x] 1.4 Criar RPC `registrar_autores_lado(uuid, smallint, jsonb, text)` SECURITY
  DEFINER com MODO EXPLÍCITO: `p_modo='append'` (base=existente, soma; autoriza
  técnico-do-lado OU árbitro) / `p_modo='replace'` (base=vazia, substitui; autoriza
  SÓ árbitro). Escopo 1 lado (delete/insert por `lado=p_lado`); teto normais+contra
  ≤ placar; roda encerrada; `gols` com RANGE no `numeric` ANTES do `::int`
  (`>=1 and <100` → `floor`; nem `2.5` nem `1e20` aborta com 22P02/22003). Erros
  AUTH_REQUIRED/LADO_INVALIDO/MODO_INVALIDO/PARTIDA_INVALIDA/LADO_SEM_VAGA/
  NAO_AUTORIZADO/TETO_LADO. Grant EXECUTE `authenticated`, revoke public/anon.
- [x] 1.5 Estender `aprovar_proposta_placar`: parsear `contra`, agregar por (lado,
  contra, nome), inserir `contra`, teto conta contra, **delete POR-LADO** (só os
  lados governados; `null` e `[]` preservam; o lado oposto colaborativo fica
  intocado), e `gols`/`lado` com RANGE no `numeric` ANTES do `::int` (lado
  `::numeric in (1,2)`; gols `>=1 and <100`) — item fora de faixa ignorado, nunca
  aborta.
- [x] 1.6 **Hall da fama (BLOQUEANTE):** editar `registrar_conquistas_temporada` em
  `schema.sql` (+ reproduzir em `ddl.sql`) — no join do bloco "(c) Artilheiro por
  divisão", `join public.match_goals g on g.match_id = m.id and g.contra = false`.
  Reproduzir o corpo ATUAL inteiro (a change não tocava essa RPC) com essa única
  mudança. Idempotente (`create or replace` + os revoke/grant).
- [x] 1.7 **Trigger W.O. (HARDENING):** `matches_limpar_gols_wo` AFTER UPDATE em
  `public.matches` `when (new.wo=true and new.status='encerrada' and (old.wo is
  distinct from new.wo or old.status is distinct from new.status))` → função
  `limpar_gols_no_wo()` SECURITY DEFINER que `delete from match_goals where
  match_id=new.id`. Atômico com o encerramento por W.O.; cobre simples/duplo/órfão/
  aceite. Revoke EXECUTE de todos (trigger-only). Conferir que não conflita com
  `matches_lock_lifecycle` (BEFORE) nem com o lock de `wo_duplo`.
- [x] 1.8 `ddl.sql` com o SQL exato + pré/pós-checagens. NÃO aplicar (REGRA 4 — dono
  aplica após ver o SQL).

## 2. Tipos gerados — `src/lib/supabase/database.types.ts` (BLOQUEANTE typecheck)
- [x] 2.1 `match_goals` Row/Insert/Update: adicionar `contra: boolean`; trocar
  `jogador: string` → `jogador: string | null` (nullable é LOAD-BEARING: força o
  filtro `contra=false` antes de `.trim()` em getArtilharia/getArtilheirosDoCompetidor).
- [x] 2.2 Bloco `Functions`: adicionar assinatura `registrar_autores_lado(uuid,
  smallint, jsonb, text)`; conferir `registrar_conquistas_temporada` (sem mudança de
  assinatura). Método: preferir regenerar (`supabase gen types typescript --local`
  após aplicar o schema atualizado ao stack LOCAL) OU hand-edit.

## 3. Schema Zod — `src/schema/matchSchema.ts`
- [x] 3.1 `autorGolSchema`: adicionar `contra: boolean` (default false); `jogador`
  obrigatório quando `contra=false`, opcional/nullable quando `contra=true`.
- [x] 3.2 `checarAutores`: soma por lado (normais + contra) ≤ placar; duplicata por
  `(lado, contra, nome normalizado)` — anônimo por `(lado, true, '')`.
- [x] 3.3 `chaveAutor`/`agregarAutores`: chavear por `(lado, contra, nome)`;
  preservar `contra` na agregação.
- [x] 3.4 Novo `registrarAutoresLadoSchema` (`matchId`, `lado`, `autores:
  {jogador?: string|null, gols 1..99, contra bool}[]`, `modo: 'append'|'replace'`),
  com a regra jogador-obrigatório-quando-normal.
- [x] 3.5 Testes: contra sem jogador aceito; normal sem jogador rejeitado; jogador
  >60 rejeitado (inclusive contra nomeado); teto conta contra; duplicata por
  lado+contra; dois anônimos no mesmo lado = duplicata.

## 4. Escritores de ENTRADA: `contra` + delete POR-LADO
- [x] 4.1 `src/actions/match.ts` `updateMatchScore`: gravar `contra`; trocar o
  delete-do-match-inteiro por delete escopado aos LADOS presentes no `autores`
  submetido (lado ausente = intocado); `autores` ausente = preserva tudo; `[]` =
  no-op (não "limpa o match").
- [x] 4.2 `src/actions/scoreProposals.ts` `proporPlacar`: incluir `contra` no jsonb
  `autores` da proposta.
- [x] 4.3 **W.O./0×0 limpa `match_goals` (via TRIGGER — task 1.7):** a limpeza é do
  TRIGGER `matches_limpar_gols_wo` (atômico), NÃO app-layer — `src/actions/wo.ts`
  NÃO precisa deletar `match_goals` (evita a janela de corrida e a regra espalhada
  por 4 caminhos).
- [x] 4.4 Testes: direto grava contra; direto não apaga o lado ausente do payload;
  proposta guarda contra. (W.O. limpa `match_goals` é coberto pelo pgTAP do trigger,
  task 8.1.)

## 5. Server Action nova — `src/actions/matchGoals.ts`
- [x] 5.1 `registrarAutoresLado(matchId, lado, autores, modo)`: valida via Zod, chama
  a RPC `registrar_autores_lado` passando `p_modo`, mapeia erros da RPC para mensagens
  amigáveis (incl. MODO_INVALIDO), revalida a página do torneio. ADITIVA. **No
  `modo='append'` o `autores` recebido é SÓ o DELTA** (as entradas novas do editor
  "Meus artilheiros") — a action NÃO reconstrói/soma o existente (a RPC já soma o que
  está na tabela); reenviar o existente dobraria.
- [x] 5.2 Testes (mock): passa `modo` correto por superfície; append envia só o
  delta; propaga erro do teto.

## 5b. Invariante placar (R1) + leitor compartilhado (R4)
- [x] 5b.1 (R1) Invariante `soma(match_goals de um lado) ≤ placar[lado]` SEMPRE:
  ao gravar placar (`updateMatchScore` direto e `aprovar_proposta_placar`),
  para CADA lado cujo novo placar < soma já gravada daquele lado, DELETAR os
  `match_goals` daquele lado no mesmo passo (poda de órfãos → hall da fama).
  Refletido em ddl.sql + schema.sql (aprovar) + design.md §3 + spec + pgTAP.
- [x] 5b.2 (R4) Leitor compartilhado `getGolsCrusPorPartida` (batelado, por
  partida/lado/`contra`) + `resumoDoLado` em `src/features/match/data/getMatchGoals.ts`;
  consumido pelo editor "Meus artilheiros" (7.3), badge (7.5) e detalhe (7.6).

## 6. Leitores de match_goals excluem gol contra
- [x] 6.1 `getArtilharia.ts`: `select … contra`, ignorar `contra = true`.
- [x] 6.2 `getArtilheirosDoCompetidor.ts`/`golsPorNomeDoCompetidor`: filtrar
  `contra = true` num único ponto (carreira + `getScorerSuggestions` herdam).
- [x] 6.3 (o hall da fama já está coberto na task 1.6 — filtro no SQL da RPC.)
- [x] 6.4 Testes: gol contra não entra no ranking, carreira, autocomplete; gol normal
  segue contando.

## 7. UI
- [x] 7.1 `MatchScoreModal`/`AutoresLado`: toggle "gol contra" por linha (esconde/
  torna opcional o campo de nome); só nos lados com vaga (competitivo); envia
  `contra` por `onSave` (direto) e `onEnviarProposta` (proposta).
- [x] 7.2 **Preload EDITÁVEL nas superfícies REPLACE:** prop `autoresIniciais`
  (fetch dos `match_goals` por lado E por contra) no `MatchScoreModal` do lançamento
  DIRETO do organizador e no console do organizador → captura reflete o estado
  atual, nunca abre vazia sobre gols gravados; `autoresTocado` governa `undefined`
  (preserva) vs a lista COMPLETA. (Modo proposta do técnico: preload naturalmente
  vazio — sem placar/gols materializados ainda.)
- [x] 7.3 Editor "Meus artilheiros" (`append`) em partida ENCERRADA competitiva:
  **ponto de entrada** = card da partida na lista/detalhe do torneio; **gate de
  exibição** = `status='encerrada'` + competitivo + `auth.uid()` == `slot.user_id`
  de UM lado; **resolve o lado do técnico** por `vaga_1.user_id`/`vaga_2.user_id`;
  os autores JÁ registrados aparecem **SOMENTE-LEITURA** (NÃO reusa a captura
  editável do modal); mostra "X de Y gols atribuídos" (Y=placar[lado]) e o orçamento
  restante; no save submete **APENAS o DELTA** via `registrarAutoresLado(...,
  'append')` — nunca reenvia as linhas pré-carregadas (senão a RPC dobra).
- [x] 7.4 Console do organizador (`OpenMatchesList`/`PropostasPendentes`): editor
  COMPLETO dos DOIS lados via `registrarAutoresLado(..., 'replace')`.
- [x] 7.5 **Badge de descoberta:** indicador "faltam N artilheiros" nas partidas
  encerradas competitivas em que o lado do técnico logado tem `placar[lado] > soma
  atribuída` — puxa o técnico ao editor "Meus artilheiros".
- [x] 7.6 Detalhe da partida: exibir gol contra à parte ("N gols + M contra"), fora
  do ranking de artilheiros.

## 8. Testes pgTAP REAIS — `supabase/tests/` (BLOQUEANTE — mock = falso-verde)
- [x] 8.1 Autorar `supabase/tests/<nnn>_match_goals.sql` (pgTAP, contra Postgres
  REAL, padrão da suíte de RLS/hardening) exercitando: (a) `append` soma; (b)
  `replace` substitui; (c) **ASSERT: o lado OPOSTO permanece intacto** após escrever
  um lado; (d) `TETO_LADO` ao exceder; (e) roda com partida ENCERRADA; (f)
  `NAO_AUTORIZADO` (nem árbitro nem técnico do lado; e `replace` por técnico não-árbitro);
  (g) `LADO_SEM_VAGA` (avulso); (h) `aprovar_proposta_placar` preserva `contra`, NÃO
  deleta o lado oposto colaborativo, e o gol contra NÃO entra no ranking; (i)
  `registrar_conquistas_temporada` NÃO materializa gol contra como artilheiro; (j)
  `gols` fracionário (`2.5`) e gigante (`1e20`) por POST direto NÃO abortam a RPC
  (item ignorado); (k) o TRIGGER `matches_limpar_gols_wo` remove os `match_goals` ao
  marcar W.O. (partida com gols → W.O. 0×0 → zero gols), e o encerramento NORMAL
  PRESERVA os gols; (l) `append` com o payload contendo SÓ o delta não dobra (existente
  Vini:2 + delta João:1 = Vini:2, João:1, não Vini:4).

## 9. Gate
- [x] 9.1 `openspec validate add-artilharia-colaborativa --strict` = valid.
- [x] 9.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline).
- [x] 9.3 `pnpm test:rls` (OBRIGATÓRIO) — as garantias centrais/de segurança da RPC
  vivem em plpgsql; o vitest mockado é falso-verde.
- [x] 9.4 Validação visual 390px + desktop, 2 temas (toggle contra; preload; editor
  pós-encerramento do técnico + badge; console do organizador). Requer login
  (pendência do dono se o agente não puder logar).
