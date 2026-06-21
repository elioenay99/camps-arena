## 1. Banco de dados (DDL)

- [x] 1.1 Enums: `cup_format` (mata_mata|grupos_mata_mata), `cup_scope` (nacional|continental — mapeia a coluna `abrangencia`), `cup_origin_type` (divisao|copa), `cup_season_status` (rascunho|montada|ativa|encerrada), `cup_competition_status` (ativa|arquivada)
- [x] 1.2 Tabela `cup_competitions` (nome, created_by, status `cup_competition_status` not null default 'ativa', abrangencia, formato, por_nome, ida_e_volta, terceiro_lugar, qtd_grupos, classificados_por_grupo, desempate_criterio, is_public, cores) + CHECK de coerência de formato (geometria de grupos só em grupos_mata_mata; produto potência de 2)
- [x] 1.3 Tabela `cup_qualification_rules` (cup_competition_id, origem_tipo, origem_competition_id, origem_nivel, origem_cup_id, posicao_inicio, posicao_fim, prioridade, rotulo) com CHECK XOR de origem, CHECK `posicao_fim >= posicao_inicio >= 1`; ON DELETE: cup_competition_id CASCADE, origem_competition_id/origem_cup_id RESTRICT (não perder regra silenciosamente)
- [x] 1.4 Tabela `cup_seasons` (cup_competition_id ON DELETE CASCADE, numero único, status, tournament_id ON DELETE RESTRICT sentinela, config_snapshot jsonb, previous_season_id, montada_em, encerrada_em) + índice único parcial em tournament_id
- [x] 1.5 Tabela `cup_entries` (cup_season_id ON DELETE CASCADE, team_id XOR rotulo, origem_rule_id nullable, origem_season_id, origem_descricao, seed, posicao_final nullable, slot_id ON DELETE RESTRICT, manual) + UNIQUE participante por edição (parcial: por team_id e por lower(trim(rotulo)), sem origem) + índice único parcial em slot_id. Vaga vazia = AUSÊNCIA de linha (não placeholder). Tabela `cup_season_exclusions` (cup_season_id ON DELETE CASCADE, team_id XOR rotulo) para exclusões persistentes na re-derivação
- [x] 1.6 RPC `montar_copa(p_cup_season_id, p_seeded_entry_ids[])` SECURITY DEFINER: autoriza por `created_by` direto (join cup_seasons→cup_competitions), advisory lock namespace 2, pré-checks (ENTRY_DE_OUTRA_EDICAO, COPA_HETEROGENEA por_nome da division_season consumida, capacidade `2≤N≤32`/`COPA_LOTADA`, validarGeometria para grupos), sentinela tournament_id, cria 1 tournament (grava classificados_por_grupo p/ grupos) + slots por team_id/rotulo com competitor_id/user_id NULL na ordem de seeding, grava cup_entries.slot_id; promote-first idempotente. `revoke execute from public,anon; grant authenticated`
- [x] 1.7 RPCs DEFINER de leitura gated `classificacao_final_divisao(p_competition_id,p_nivel)` e `classificacao_final_copa(p_cup_id)`: gate de consentimento (origem is_public OU created_by=auth.uid(), senão ORIGEM_INVISIVEL), season/edição encerrada de maior numero (ORIGEM_NAO_ENCERRADA), nível existente (NIVEL_INEXISTENTE), retornam lista ordenada (posicao_final asc, competitor_id asc) com rank contíguo. `revoke ... from public,anon; grant authenticated`
- [x] 1.8 Helper `eh_dono_cup(cup_competition_id)` DEFINER (EXECUTE a anon+authenticated — NUNCA revogar); policies RLS de `cup_*`: SELECT `is_public or created_by=auth.uid()` (status NÃO é gate); INSERT/UPDATE/DELETE só created_by; grants de tabela a authenticated
- [x] 1.9 Trigger/função DEFINER anti-ciclo copa→copa (CICLO_DE_COPAS, cobertura transitiva) na criação/edição de regra; guard que recusa apagar copa com edição materializada
- [x] 1.10 Compor o SQL completo e **mostrar no chat**; aplicar em PROD via MCP; `get_advisors` (0 ERROR); espelhar em `supabase/schema.sql`; atualizar `database.types.ts` à mão; aplicar no LOCAL via psql

## 2. Schema e tipos de domínio

- [x] 2.1 Zod `cupSchema` (criação da copa + formato coerente, geometria potência de 2)
- [x] 2.2 Zod `cupRuleSchema` (origem XOR, faixa válida, consentimento best-effort, por_nome best-effort, anti-ciclo client best-effort)
- [x] 2.3 Zod `cupManualEntrySchema` (team/rotulo conforme por_nome; normaliza rótulo via trim+lower)
- [x] 2.4 Tipos de domínio (`src/features/cup/types.ts`): Copa, RegraQualificacao, EdicaoCopa, ParticipanteCopa, PoolDerivado, ClassificacaoFinalCopa

## 3. Motor de derivação (TS puro, testável)

- [x] 3.1 `lerClassificacaoFinalDivisao` — wrapper da RPC `classificacao_final_divisao` (posicao_final + join league_competitors); NÃO reusa carregarLinhasBaseDivisao
- [x] 3.2 `lerClassificacaoFinalCopa` — lógica NOVA: percorre partidas (match) da chave, reusa decidirConfronto/rodadas/3º-lugar/totalFases de gerarChaveMataMata.ts, infere fase de eliminação, ordena (fase desc, seed asc); trata terceiro_lugar e grupos_mata_mata
- [x] 3.3 `derivarPool` (puro): aplica regras sobre rank de seeding contíguo por origem; varredura única ordenada por (prioridade, rank); dedup por identidade de edição (team_id ou lower(trim(rotulo)), sem origem) com CURSOR POR ORIGEM; preserva manuais (âncoras) e exclusões (cup_season_exclusions); vaga vazia = pool reduzido (sem linha)
- [x] 3.4 `validarGeometriaCopa` — mata-mata `2≤N≤32` (importa MATA_MATA_MAX_PARTICIPANTES); grupos via validarGeometria sobre N efetivo
- [x] 3.5 Testes do motor: faixa 1..4 com empate/lacuna; dedup com cursor por origem + queda; duas regras da mesma origem; origem esgotada (vaga vazia); copa-origem campeão/vice/fase; teto 32 (COPA_LOTADA); geometria grupos

## 4. Server Actions

- [x] 4.1 `criarCopa` (cria cup_competitions + regras; valida consentimento, homogeneidade best-effort, anti-ciclo) em `src/actions/cups.ts`
- [x] 4.2 `editarRegrasCopa` (add/edita/remove regras; revalida consentimento e anti-ciclo server-side)
- [x] 4.3 `criarEdicaoCopa` (cup_seasons rascunho, numero sequencial, previous_season_id)
- [x] 4.4 `derivarVagasCopa` (chama RPCs de leitura gated por regra; monta pool via motor; grava cup_entries preview com origem_season_id; preserva manuais/exclusões; propaga ORIGEM_NAO_ENCERRADA/ORIGEM_INVISIVEL/NIVEL_INEXISTENTE)
- [x] 4.5 `ajustarParticipantesCopa` (add/remove/reordena entries manuais em rascunho; recusa PARTICIPANTE_DUPLICADO; persiste exclusões)
- [x] 4.6 `montarEdicaoCopa` (wrapper da RPC montar_copa; traduz erros; revalida path)
- [x] 4.7 `iniciarEdicaoCopa` (mata-mata: ordena slots por cup_entries.seed → gerarChaveSemeada, sem remap competitor_id; grupos: lê qtd_grupos/classificados do snapshot → gerarFaseGruposSemeada; transição para ativa)
- [x] 4.8 `encerrarEdicaoCopa` (manual; exige torneio encerrado; computa lerClassificacaoFinalCopa e grava cup_entries.posicao_final + status encerrada + encerrada_em)
- [x] 4.9 `arquivarCopa` / `apagarCopa` (arquivar = status; apagar só sem edição materializada)

## 5. UI (RSC-first, pt-BR, mobile-first 390px, 2 temas)

- [x] 5.1 Wizard de criação `src/features/cup/components/CupWizard.tsx` (identidade/formato → regras com seletor origem divisão/copa + faixa + prioridade → revisão)
- [x] 5.2 Dashboard de copas `src/app/dashboard/copas/page.tsx` + `getCups` (copas do dono; edição corrente; abrangência; arquivadas separadas)
- [x] 5.3 Página "Nova copa" `src/app/dashboard/copas/nova/page.tsx`
- [x] 5.4 Página da copa `src/app/dashboard/copas/[id]/page.tsx` (regras, edições, criar edição, arquivar/apagar)
- [x] 5.5 Página da edição `src/app/dashboard/copas/edicao/[id]/page.tsx`: preview de participantes (origem/temporada consumida, vagas vazias, N-alvo/excesso vs teto 32 e geometria), ajuste manual, botões derivar/montar/iniciar/encerrar
- [x] 5.6 Reuso da visualização de chave/grupos (BracketView/grupos) e do fluxo de placar do torneio da edição
- [x] 5.7 Navegação/links e empty-states (sem copas; edição sem origem encerrada; aviso de mudança de profundidade da origem)

## 6. Portões de qualidade

- [x] 6.1 `pnpm typecheck` verde
- [x] 6.2 `pnpm lint` verde
- [x] 6.3 `pnpm test` verde (inclui testes do motor de derivação e de lerClassificacaoFinalCopa)
- [x] 6.4 `pnpm build` verde
- [x] 6.5 Review adversarial do diff por workflow; corrigir HIGH/CRITICAL

## 7. Validação e fechamento

- [x] 7.1 Validação ao vivo no LOCAL (390px, 2 contas, 2 temas): copa nacional mata-mata sobre pirâmide encerrada → derivar → ajuste manual → montar → iniciar → jogar → encerrar (posicao_final gravado) → campeão; depois continental cruzando 2 pirâmides; e copa-origem (campeão de uma copa classifica para outra)
- [x] 7.2 Confirmar ativação diferida (ORIGEM_NAO_ENCERRADA), consentimento (ORIGEM_INVISIVEL), teto 32 (COPA_LOTADA) e dedup com queda
- [x] 7.3 Commit pt-BR (Conventional Commits, sem coautoria) + push
- [x] 7.4 `openspec archive add-copas-continentais` e atualizar a memória de retomada
