## 1. DDL (SQL ESCRITO + APROVADO pelo dono + espelhado em `schema.sql`; falta aplicar LOCAL/PROD na validação)
<!-- migration.sql escrito; aprovado via AskUserQuestion; espelhado no fim de supabase/schema.sql.
     Aplicar no LOCAL (psql) na fase de validação ao vivo e no PROD (MCP) ao final. -->


- [x] 1.1 Tabela `match_score_proposals` (+ índice único parcial 1-pendente + índice por match).
- [x] 1.2 Coluna `match_wo_requests.foto_path text` (nullable).
- [x] 1.3 Bucket `match_evidence` (privado) com `file_size_limit=5MB` + `allowed_mime_types` (jpeg/png/webp).
- [x] 1.4 Storage policies de `match_evidence`: INSERT/UPDATE/DELETE dono-da-pasta; **SELECT** dono-da-pasta OU (arbitrar/jogador via `match_id` no 2º segmento do path, **com guarda de formato uuid antes do `::uuid`**) — leitura pela SESSÃO, sem service_role.
- [x] 1.5 Policies RLS de `match_score_proposals`: INSERT (técnico de vaga, JOIN a matches, liberada, não-encerrada, `submetido_por=auth.uid()`); SELECT (arbitrar OU jogador); sem UPDATE/DELETE p/ sessão.
- [x] 1.6 RPC `aprovar_proposta_placar(p_id)` SECURITY DEFINER: auth arbitrar; **1 UPDATE** placar+`status='encerrada'` (trigger valida/rollback); marca aprovada; rejeita irmãs pendentes set-based (com `resolvido_por`).
- [x] 1.7 RPC `rejeitar_proposta_placar(p_id, p_motivo)` SECURITY DEFINER: auth arbitrar; marca rejeitada + motivo + `resolvido_por`.
- [x] 1.8 Estreitar `matches_update_participant` para AVULSO (remover ramo do técnico de vaga).
- [x] 1.9 Advisor de segurança sem ERROR; espelhar TUDO em `supabase/schema.sql`.

## 2. Backend

- [x] 2.1 Zod schemas (`proporPlacar` com File; rejeição com motivo).
- [x] 2.2 Action `proporPlacar(formData)`: auth técnico; valida File (≤5MB, image/*); **a action constrói** o path `<uid>/<matchId>/<rand>`; upload pela sessão; reenvio substitui a pendente (rejeita anterior + remove foto antiga best-effort); insere proposta; **se o INSERT falhar, remove a foto recém-enviada (rollback, como atualizarAvatar)**; notifica aprovadores.
- [x] 2.3 Actions `aprovarPropostaPlacar`/`rejeitarPropostaPlacar` (chamam os RPCs; mapeiam erros; varrer órfãos best-effort após aprovar; notificam o submetido_por).
- [x] 2.4 `updateMatchScore`: aceita `ehJogadorDaPartida` avulso OU `podeArbitrar`; recusa técnico competitivo com mensagem "envie para aprovação".
- [x] 2.5 `updateMatchTeams`: autorizar SÓ avulso (participante_1/2), não o técnico de vaga (alinha com D7/T2).
- [x] 2.6 `solicitarWO` aceita `foto?: File` (opcional; mesmo upload/validação na action).
- [x] 2.7 Fetcher de propostas pendentes por torneio (placar + nome dos lados); `getActiveMatches` retorna `podeArbitrar` por partida.
- [x] 2.8 Rota `GET .../evidencia/[tipo]/[refId]`: sessão lê a foto_path (RLS), `createSignedUrl(60s)` pela sessão → 302; 404 se não vê.

## 3. UI

- [x] 3.1 `MatchScoreModalConnected`/`MatchCard`: modo `proposta` (foto OBRIGATÓRIA + "Enviar para aprovação"), derivado de `competitivo && !podeArbitrar`.
- [x] 3.2 `SolicitarWoButton`: foto opcional; corrigir `jogaPartida` (OpenMatchesList) p/ reconhecer técnico de vaga.
- [x] 3.3 Seção "Resultados pendentes" na página do torneio (placar + foto via rota + Aprovar/Rejeitar c/ motivo).

## 4. Gates

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (+ testes novos).
- [x] 4.2 Revisão adversarial por workflow (RLS/auth/atomicidade/storage) sem `must_fix`.
- [x] 4.3 Validação ao vivo (browser, 390px, LOCAL): técnico envia placar+foto → pendente; admin vê foto, aprova → encerra; rejeita c/ motivo; W.O. com foto; foto alheia → 404; empate em mata-mata recusa.

## 5. Arquivar

- [x] 5.1 `openspec archive add-proposta-resultado-foto`; commit (pt-BR, sem coautoria); push; derrubar Docker.
