## 1. Banco de dados (DDL — mostrar SQL antes; espelhar em schema.sql; LOCAL via psql)

- [x] 1.1 Enum `cup_origin_type` ganha `divisao_todos` (`ALTER TYPE ADD VALUE`, passo isolado fora de transação) — espelhado em `schema.sql` (literal do enum + `add value if not exists` idempotente)
- [x] 1.2 `cup_qualification_rules`: `posicao_inicio/fim` viram nullable; reescrever CHECK `_origem_xor` (divisao_todos ⇒ competition_id + nivel, cup null) e CHECK `_faixa_valida` (faixa NULA p/ divisao_todos, obrigatória p/ divisao/copa)
- [x] 1.3 `cup_entries.tecnico_user_id uuid references users(id) on delete set null` (técnico vivo do slot, gravado na derivação; NULL p/ órfão/clássico/por-nome/manual)
- [x] 1.4 RPC `inscritos_divisao(p_competition_id, p_nivel)` DEFINER + `set search_path=''`: gate de consentimento (`is_public OR created_by=auth.uid()` ⇒ `ORIGEM_INVISIVEL`), temporada EM DISPUTA (maior `numero` com `status <> 'rascunho'` — NÃO exige `encerrada`, mas EXCLUI a rascunho: `montarProximaTemporada`, `leaguePyramid.ts:2008-2040`, cria a N+1 rascunho de maior número ao avançar, com slots frescos `user_id`=NULL; sem esse filtro a RPC leria a rascunho vazia e ZERARIA todos os técnicos ao re-derivar — achado MEDIUM da revisão), `NIVEL_INEXISTENTE`, todos os competidores com `competitor_id` + `tecnico_user_id` do slot (LEFT JOIN — órfão NULL), rank por `(created_at, id)`, `posicao_final := rank`. `revoke from public,anon; grant authenticated`
- [x] 1.5 `montar_copa`: técnico via `coalesce(cup_entries.tecnico_user_id, league_competitors.holder_user_id)` no ramo por-clube (caminho clássico intocado; dedup `v_holders_usados` preservado); mantido `create or replace` (assinatura intacta ⇒ grants preservados, sem re-emissão)
- [ ] 1.6 Compor o SQL completo e **mostrar no chat**; aplicar via MCP; `get_advisors` (0 ERROR); espelhar em `supabase/schema.sql`; atualizar `database.types.ts` à mão; aplicar no LOCAL via psql — **SQL escrito em `schema.sql` + `database.types.ts` à mão; aplicação no banco é do orquestrador**

## 2. Schema Zod e tipos

- [x] 2.1 `src/schema/cupSchema.ts`: `ORIGEM_TIPOS_DISPONIVEIS` ganha `"divisao_todos"`; `superRefine` da regra: para `divisao_todos`, `posicaoInicio/posicaoFim` opcionais/ignorados (exige `origemCompetitionId` + `origemNivel`, proíbe `origemCupId`)
- [x] 2.2 `src/features/cup/types.ts`: `RegraQualificacao.origem_tipo` aceita `divisao_todos` (posições nullable via `database.types.ts`); `OrigemClassificacao` ganha `tecnico_user_id?: string | null`; `EntradaPool` propaga `tecnico_user_id`

## 3. Motor de derivação (TS puro, testável)

- [x] 3.1 `chaveDaOrigem`: ramo `divisao_todos` ⇒ chave `todos:comp:nivel` (DISTINTA de `div:…` — leitura vem de outra RPC)
- [x] 3.2 `derivarPool`: ramo DEDICADO `divisao_todos` que percorre a LISTA INTEIRA do cache e adiciona toda identidade AINDA LIVRE, SEM contagem-alvo fixa e **SEM emitir `LacunaPool`** (roda DEPOIS das regras de faixa; só pula já-alocados/excluídos)
- [x] 3.3 Propagar `tecnico_user_id` da linha escolhida para a `EntradaPool` (só quando `team_id` presente — por-clube); origem clássica/por-nome ⇒ null/undefined
- [x] 3.4 Testes do motor (`derivacao.test.ts`): divisão inteira sem faixa; clube órfão com `tecnico_user_id` null; dedup `divisao` × `divisao_todos` mesma competição+nível; mistura Série A + Série B = 40; **`divisao_todos` + âncora manual sobreposta ⇒ N entradas e ZERO lacunas** (regressão do achado LOW); + exclusão persistente no sweep + chaveDaOrigem distinta

## 4. Server Actions

- [x] 4.1 `src/actions/cups.ts` INSERT/edição de regras: helper `regraParaLinha` (DRY entre `criarCopa`/`editarRegrasCopa`) aceita `divisao_todos` (competition+nível; posições NULL)
- [x] 4.2 `lerOrigemViaRpc`: ramo `divisao_todos` ⇒ chama `inscritos_divisao`; mapeia linhas p/ `OrigemClassificacao` com `tecnico_user_id`
- [x] 4.3 `resolverNomesDeOrigem`: descrição da origem "todos" (nome da divisão + "todos os clubes")
- [x] 4.4 `validarConsentimentoRegras`: incluir `divisao_todos` na checagem de consentimento (mesma origem-pirâmide)
- [x] 4.5 `derivarVagasCopa`: gravar `cup_entries.tecnico_user_id` no preview; propaga `ORIGEM_INVISIVEL`/`NIVEL_INEXISTENTE` (via `mensagemDaCopa`)

## 5. UI (RSC-first, pt-BR, mobile-first 390px, 2 temas)

- [x] 5.1 `RuleListEditor.tsx` / `CupWizard.tsx` / `CupRulesPanel.tsx` + view read-only em `copas/[id]/page.tsx`: opção de origem "Todos os clubes da divisão"; inputs de faixa escondidos quando `divisao_todos`; mantidos alvos/`text-base` do editor existente
- [x] 5.2 Novo fetcher `getCopasDaPiramide(supabase, competitionId)` (ZERO-DDL): copas com regra `origem_competition_id = competitionId` (tipos `divisao`/`divisao_todos`), distintas, RLS via embed `!inner`
- [x] 5.3 Seção "Copas" em `src/app/dashboard/ligas/[id]/page.tsx` (padrão das outras seções; empty-state "nenhuma copa alimentada por esta pirâmide")

## 6. Portões de qualidade (gates automáticos)

- [x] 6.1 `pnpm typecheck` verde
- [x] 6.2 `pnpm lint` verde
- [x] 6.3 `pnpm test` — subset do motor verde (`src/features/cup src/schema`, 238 testes); suíte completa/`build` deixados p/ o orquestrador (restrição de recursos)
- [ ] 6.4 `pnpm build` verde — NÃO rodado (restrição de recursos; orquestrador)
- [ ] 6.5 Review adversarial do diff por workflow; corrigir HIGH/CRITICAL — orquestrador

## 7. Validação e fechamento

- [ ] 7.1 Validação ao vivo no LOCAL (390px, 2 temas): copa grupos+mata sobre a pirâmide EM DISPUTA → regra "todos Série A" + "todos Série B" → derivar (40 clubes; Série A com técnicos, Série B com órfãos sem técnico) → montar → iniciar → chave de 32 com 8 grupos de 5
- [ ] 7.2 Confirmar técnico dinâmico (quem assumiu o slot aparece; re-derivar repega), órfão sem técnico, consentimento (`ORIGEM_INVISIVEL`) e caminho clássico sem regressão
- [ ] 7.3 Visão consolidada: a copa aparece na seção "Copas" da página da pirâmide (pública e do dono)
- [ ] 7.4 Commit pt-BR (Conventional Commits, sem coautoria) + push
- [ ] 7.5 `openspec archive copa-todos-da-piramide` e atualizar a memória de retomada
