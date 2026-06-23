## Why

A auditoria multi-agente de 2026-06-15 deixou um conjunto de LOWs/NITs em aberto. Uma
verificação por workflow (2026-06-23) os reavaliou contra o código ATUAL: 5 são **bugs
reais hoje** (segurança/PII/UX) e 1 é **latente com consequência irreversível**. Esta
change corrige os 6; o resíduo `liberada_em` fica **deferido** (verificado como inerte
hoje e cujo fix toca o trigger crítico de ciclo da partida — melhor resolver junto da
feature de agendamento futuro que o dispara).

## What Changes

- **Cache de clubes (`teams`)**: a policy de INSERT usa `with_check(true)` e a tabela não
  tem CHECK no `nome` — qualquer usuário autenticado pode gravar, via PostgREST direto, um
  clube de nome arbitrário no cache global. Endurecer: CHECK de tamanho no `nome` (e formato
  do `external_id`) + `with_check` validando o mesmo. O INSERT segue amplo por design (o
  cache é global/público); muda só a sanidade do dado.
- **`montarProximaTemporada`**: Server Action exportada (`"use server"`) SEM auth/posse no
  app-layer — endpoint redundante (único caller é interno). Tornar a função **interna** ao
  módulo, fechando o endpoint (a RLS + RPC `montar_temporada` já barram o abuso de dados).
- **Telemetria (Sentry)**: o scrubber redige telefone BR/wa.me mas **não redige e-mail** →
  PII de e-mail pode vazar em `message`/`extra`/`breadcrumb`. Adicionar redação de e-mail.
- **PII no Flight**: o `MatchCard` serializa ao client o `celular` (e a mensagem wa.me) do
  lado **não-convocável**, que o modal nunca usa. Podar — só o lado convocável leva o número.
- **Unicidade de competidor por temporada (pirâmide)**: o Zod/Wizard validam nome/clube
  repetido **por divisão**, mas o índice único do banco é **por competição** — repetir o
  mesmo clube/nome em DUAS divisões da temporada passa na validação e estoura no INSERT
  (23505 → erro genérico + rollback total). Alinhar a validação ao escopo do banco (cross-
  divisão), com feedback de campo preciso.
- **Integridade do promédio plurianual**: a leitura do histórico de pontos/jogos (fonte do
  corte IRREVERSÍVEL de sobe/cai) não pagina — se o cap de linhas do PostgREST for atingido
  (muitas temporadas), a soma trunca silenciosamente e o corte sai errado. Ler o histórico
  COMPLETO de forma determinística (paginação), preservando exatamente a mesma soma.

## Capabilities

### Modified Capabilities
- **team-search**: o cache de clubes passa a impor sanidade de tamanho/forma do clube no banco.
- **observability**: a redação de PII na telemetria passa a cobrir e-mail.
- **league-pyramid**: a unicidade de competidor passa a ser validada por temporada (cross-
  divisão) na borda; o promédio plurianual passa a ser lido de forma completa/determinística.

## Impact

- **DDL** (só `teams`; PROD via MCP mostrando o SQL + LOCAL via psql; espelhada em
  `supabase/schema.sql`): CHECK `teams_nome_tam`/`teams_external_id_num` + `with_check`
  endurecido. **Pré-checagem**: confirmar que os dados de PROD já satisfazem os CHECKs antes
  de aplicar (SELECT de auditoria).
- Sem DDL nos demais (código puro: actions/schema Zod/UI/observabilidade).
- **Deferido (fora do escopo, documentado):** `liberada_em` — resíduo inerte hoje
  (`with_check` booleano + sem UI de agendamento). Corrigir como pré-requisito da feature de
  agendamento futuro (guarda de coluna no `lock_match_lifecycle` + `liberarRodadas` cobrindo
  agendadas), conforme recomendação da própria auditoria.
