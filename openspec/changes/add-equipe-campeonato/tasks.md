# Tasks — add-equipe-campeonato (v2, pós-gate `wop4hm591`)

Gate adversarial `wop4hm591`: changes_required (9 must_fix + 8 should_fix, confirmados em
código) → corrigidos no `design.md` v2. Re-verificação por workflow ANTES de implementar.
DDL ao PROD via MCP **mostrando o SQL** (REGRA 4); espelhar `schema.sql` + `database.types.ts`
(tabelas E `Functions`); EXECUTE dos helpers vai no `schema.sql` (NÃO em `local-grants.sql`).
Quality gates + workflow de REVIEW do diff antes de commitar. Validação ao vivo 390px/2 contas.

## 1. DDL — tabelas + helpers + triggers + RPCs (via MCP; espelhar schema.sql + types)

- [ ] 1.1 SQL mostrado ao dono ANTES (REGRA 4), bloco único comentado.
- [ ] 1.2 Tabelas `tournament_members`, `league_members` (papel CHECK
  `admin/arbitro/moderador`), `member_invites` (papel CHECK **só `arbitro/moderador`** —
  admin não tem link), PKs, FKs CASCADE, XOR escopo, 2 unique parciais por papel. ENABLE
  RLS nas três. **[re-gate]**
- [ ] 1.3 `liga_do_torneio(uuid)` DEFINER STABLE `search_path=''` — UNION das 5 colunas
  (apertura/clausura/final + `league_boundaries.playoff_tournament_id`). Grant anon+auth.
- [ ] 1.4 Helpers torneio `pode_gerir/arbitrar/moderar_torneio` + **`pode_ver_bastidores_torneio`**
  (dono OR QUALQUER membro/papel OR herança) e liga `pode_gerir/arbitrar/moderar_competition`
  + **`pode_ver_bastidores_competition`** (dono OR qualquer `league_member`). Todos com
  herança via `liga_do_torneio`. DEFINER/STABLE/`search_path=''`. **EXECUTE revoke PUBLIC;
  grant anon,authenticated NO schema.sql.** NÃO revogar. **[re-gate H#1]**
- [ ] 1.5 **Refatorar `lock_match_lifecycle`**: troca `t.created_by=auth.uid()` por
  `public.pode_arbitrar_torneio(new.tournament_id)` (mantém defesa de coluna + bypass
  service_role). **[must_fix #1]**
- [ ] 1.6 Trigger `lock_tournament_reopen` BEFORE UPDATE OF status ON tournaments (DEFINER,
  `search_path=''`, bypass service_role no padrão `request.jwt.claims`): barra
  `encerrado`→aberto E `ativo`→`rascunho` quando ator ≠ dono. **[must_fix #2,#6]**
- [ ] 1.7 RPCs: `info_convite_membro(text)` DEFINER (preview `{escopo,id,titulo,papel,
  ja_membro}`); `aceitar_convite_membro(text)` DEFINER (upsert papel ∈ **árbitro/moderador**;
  no-op se já dono; idempotente); `subscriptions_para_nomeacao(uuid,text,uuid)` DEFINER
  (gated pelo CALLER `(select auth.uid())`: pode_gerir o escopo E p_user é membro;
  **ramifica tournament_members vs league_members** por escopo). EXECUTE só authenticated.
  **[must_fix #4, re-gate L/NIT]**
- [ ] 1.8 Policies das 3 tabelas novas: `*_members` SELECT `pode_gerir_*` OR próprio;
  INSERT/UPDATE/DELETE `pode_gerir_*`; DELETE também próprio (sair). `member_invites` IUD
  `pode_gerir_*`; **UPDATE não altera `papel`** (with check). **[should_fix imutável]**
- [ ] 1.9 Refactor das policies dono→capacidade (tabela §6):
  - tournaments UPDATE→`pode_gerir`; **SELECT_visivel += `pode_ver_bastidores_torneio`**
    (qualquer membro vê privado); **DELETE inalterada (dono)**. **[re-gate H#1]**
  - matches: **INSERT→`pode_gerir`** (gerar fase/criar partida; preservar TODAS as cláusulas
    formato/rodada/participantes/vagas); UPDATE-owner→`pode_arbitrar`; **SELECT_visivel:
    `pode_ver_bastidores_torneio` vê tudo inclusive oculto**. **[re-gate H#1, #9]**
  - tournament_slots **INSERT/DELETE (criar/remover vaga, rascunho)→`pode_gerir`**
    (geometria=estrutura); **UPDATE(owner) (expulsar/esvaziar)→`pode_moderar`**; SELECT +=
    `pode_ver_bastidores_torneio`. **[re-gate H#2]**
  - participants: **insert-owner-self INALTERADA (self/dono)**; **delete-by-owner→`pode_moderar`**.
    **[re-gate H#2]**
  - tournament_invites→`pode_moderar`; slot_invites→`pode_moderar`; match_wo_requests
    UPDATE/SELECT→`pode_arbitrar`.
- [ ] 1.10 league_* policies (enumerar uma a uma, distinguindo direta de transitiva):
  **INSERT/UPDATE→`pode_gerir_competition`**, preservando o predicado de coerência
  cross-pirâmide nas transitivas; **DELETE de TODAS as filhas permanece
  `eh_dono_competition` (dono-only)**. `league_competitions` + SELECT transitivos +=
  `pode_ver_bastidores_competition` (qualquer membro de liga). **[re-gate H#1]**
  RPCs `montar_temporada/playoff/barragem/grande_final` trocam check interno por
  `pode_gerir_competition`; **`confirmar_fluxo`/`montar_proxima_temporada` MANTÊM
  `created_by` (dono-only)**. **[must_fix #8, decisão virar-temporada]**
- [ ] 1.11 Aplicar via MCP em PROD (`bfxmdypdxbbfedtqsqik`); espelhar `schema.sql`,
  `database.types.ts` (3 tabelas + bloco `Functions`: pode_*, aceitar/info_convite_membro,
  subscriptions_para_nomeacao, liga_do_torneio). `get_advisors(security)` (WARNs by-design
  dos DEFINER authenticated). **`local-grants.sql` intocado.** **[should_fix]**

## 2. App-layer — autorização

- [ ] 2.1 `src/lib/autorizacao.ts`: `podeGerir/podeArbitrar/podeModerar(supabase,
  {tournamentId}|{competitionId})` via `.rpc()`. Mensagem de negação única.
- [ ] 2.2 `tournaments.ts`: iniciar/avançar/encerrar/cores→gerir; liberar rodadas→arbitrar;
  **reabrir torneio + crash-recovery ativo→rascunho permanecem dono-only** (`eq created_by`).
- [ ] 2.3 **Varredura ESCOPADA** (NÃO cega): trocar `created_by`→**podeArbitrar** SÓ em
  `mudarStatusComoDono` (match.ts:464), `marcarWoInterno` (wo.ts:104-116), fechar rodada e
  varrer órfãos. **`createMatch` (match.ts:206/245) → podeGerir** (INSERT estrutural,
  coerente com matches_insert=gerir/#9); **`updateMatchTeams` (match.ts:324) INALTERADA**
  (via participante self). **[must_fix #7, re-gate MEDIUM]**
- [ ] 2.4 `leaguePyramid.ts`: iniciar divisão / montar playoffs / grandes finais / calcular
  fluxo→`pode_gerir_competition`; **confirmar fluxo + montar próxima temporada permanecem
  dono-only**. **Reescrever os filtros transitivos `.eq('...created_by')`.** **[must_fix #5]**
- [ ] 2.5 Loaders RSC de liga (`getSeason`/`getCompetition` e afins) **deixam de filtrar
  `created_by`** e gateiam por `pode_gerir_competition`. **[must_fix #5]**
- [ ] 2.6 **moderar**: convites de participante/vaga (gerar/regenerar/remover), expulsar/
  esvaziar técnico (slots UPDATE), remover participante. **gerir**: criar/remover vaga
  (rascunho). **self/dono (inalteradas)**: `participarDoProprioTorneio`,
  `assumirVagaComoDono`, técnico desistir. **[re-gate H#2]**

## 3. Gestão de equipe (actions + busca)

- [ ] 3.1 `src/actions/equipe.ts`: `gerarConviteMembro` (papel ∈ **árbitro/moderador** —
  rejeita admin)/`removerConviteMembro`/`aceitarConviteMembro`/`adicionarMembro` (admin
  permitido SÓ p/ dono)/`removerMembro`/`sairDaEquipe`. Capacidade **gerir**;
  **criar/remover/promover admin = dono-only**; sair = próprio. **0 linhas em remover/sair
  = sucesso idempotente.** `revalidatePath` nas rotas afetadas. **[must_fix, re-gate]**
- [ ] 3.2 `buscarUsuarios(query)`: `users_public` (id/nome/avatar), min 2 chars, limit 8,
  autenticado, **exclui caller + membros/dono**. Sem PII.
- [ ] 3.3 Schemas Zod `src/schema/equipe.ts` (papel, escopo, code).

## 4. UI

- [ ] 4.1 `src/features/team-roles/`: `TeamSection` (lista+remover), `MemberInviteCards`
  (link **só p/ árbitro/moderador**), `AddMemberSearch` (busca+papel; **admin só aparece
  p/ o dono**). 390px, 2 temas.
- [ ] 4.2 Rotas `/dashboard/torneios/[id]/equipe` + `/dashboard/ligas/[id]/equipe` (gate
  capacidade gerir). **`/cores` (torneio e liga) deixam de filtrar `created_by`** → gate
  por capacidade. **[must_fix #5]**
- [ ] 4.3 Rota `/equipe/convite/[code]` + `AcceptTeamInviteForm` (usa `info_convite_membro`).
- [ ] 4.4 `page.tsx` torneio + página da pirâmide: derivar `capacidades` e mapear **CADA
  botão** à capacidade, desacoplado de status (Reabrir→dono; Encerrar/iniciar/avançar→
  gerir; Liberar/W.O./placar→arbitrar; Vagas/Convites→moderar). Link "Equipe". **[should_fix]**

## 5. Push (gatilho)

- [ ] 5.1 `adicionarMembro` e `aceitar_convite_membro` (app-layer): após inserir o membro,
  enviar via `subscriptions_para_nomeacao` (best-effort). "Você virou &lt;papel&gt; em
  &lt;campeonato&gt;". **[must_fix #4]**

## 6. Testes

- [ ] 6.1 Unit: autorização (gerir/arbitrar/moderar por papel); `buscarUsuarios` (min
  chars, sem PII, exclui membros); **paridade do vocabulário de papéis** entre tabelas e
  helpers.
- [ ] 6.2 RPC `aceitar_convite_membro` (válido/inválido/já-dono/já-membro/idempotente;
  rejeita papel=admin); `info_convite_membro`; `subscriptions_para_nomeacao` (gate +
  negativo: caller que adiciona só p/ ler subs é barrado).
- [ ] 6.3 RLS reais via SQL (`auth.uid()` simulado): **árbitro encerra/reabre partida E
  marca W.O. via lock_match_lifecycle**; admin gere mas NÃO reabre/rebaixa/apaga/vira
  temporada/promove admin; admin NÃO apaga temporada/divisão (DELETE filha dono-only);
  **árbitro de torneio PRIVADO lê e atualiza placar**; **moderador de torneio PRIVADO lê o
  torneio + vagas/participantes e gera convite, mas NÃO cria/remove vaga nem lança placar**;
  árbitro NÃO insere partida de fase por POST direto; admin de liga herda divisão;
  não-membro negado; sair funciona; dono nunca removível. **[re-gate]**

## 7. Gates + review + validação + arquivamento

- [ ] 7.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (PIPESTATUS).
- [ ] 7.2 Workflow de REVIEW adversarial do diff → corrigir HIGH/CRITICAL.
- [ ] 7.3 Validação ao vivo (chrome-devtools, 2 contas, 390px, 2 temas): dono adiciona
  admin (busca)/árbitro/moderador (link) → cada um vê só seus consoles → admin tudo menos
  reabrir/apagar/virar-temporada/promover-admin → árbitro só placar/W.O. → moderador só
  pessoas → árbitro de torneio PRIVADO opera → push de nomeação chega → sair → herança em
  pirâmide.
- [ ] 7.4 Commit pt-BR (sem coautoria) + push.
- [ ] 7.5 `openspec archive add-equipe-campeonato` + atualizar memória de retomada.
