## Why

A pirâmide de ligas (`league_*`) cobre disputas de pontos corridos com sobe/cai, mas não há suporte a **copas** — torneios mata-mata/grupos paralelos cujos participantes são definidos pela classificação das ligas (Copa do Brasil) nem a **continentais** que cruzam várias pirâmides (Libertadores). O dono quer poder anexar essas competições à estrutura existente, alimentadas pela classificação, sem bagunçar a temporada corrente.

## What Changes

- Nova entidade **copa** (`cup_competitions`): competição imortal, separada da pirâmide, que materializa **uma edição por temporada** como um único torneio (reusa o motor de jogo existente — mata-mata ou grupos+mata).
- **Regras de qualificação** (`cup_qualification_rules`): cada vaga da copa é derivada de uma origem — uma **divisão de liga** (top-N / faixa de posições da classificação final) ou o **resultado de outra copa** (campeão/finalistas). Continental = origens de **múltiplas pirâmides** numa mesma copa.
- **Edições** (`cup_seasons`) e **participantes** (`cup_entries`): o dono cria uma edição quando quiser; a derivação lê a classificação final **encerrada** mais recente de cada origem, aplica **dedup por prioridade** (clube classificado por dois caminhos ocupa uma vaga; a outra cai para o próximo elegível da origem), e gera um preview de participantes que o dono pode **ajustar manualmente** antes de montar.
- **Montagem** via RPC `montar_copa` (SECURITY DEFINER, reusa de `montar_playoff` só o esqueleto): cria o torneio da edição + slots semeados (por `team_id`/`rotulo` global, `competitor_id`/`user_id` NULL); o início reusa `gerarChaveSemeada` (mata-mata, honra `seed`) / `gerarFaseGruposSemeada` (grupos, sorteio semeado).
- **Encerramento** (`encerrarEdicaoCopa`, manual): grava `cup_entries.posicao_final` (classificação final derivada do torneio) — torna a copa consultável e utilizável como origem de outra copa.
- **Ativação diferida**: como a edição só lê origens já encerradas (de maior `numero`), uma copa criada durante a temporada N só monta a partir da N+1 — sem efeito na temporada corrente.
- **Ciclo de vida**: arquivar a copa (`status='arquivada'`) e apagar apenas sem edição materializada (preserva histórico).
- **Formato configurável** por copa: mata-mata (ida-e-volta/3º-lugar opcionais, `2 ≤ N ≤ 32`) ou grupos+mata (geometria potência de 2).
- Wizard de criação, dashboard/listagem de copas e páginas de edição/classificação (RSC-first), em pt-BR, mobile-first.
- Sem mudança de comportamento na pirâmide existente (zero regressão): as copas apenas **leem** a classificação das ligas; não a alteram.

## Capabilities

### New Capabilities
- `cup-competitions`: modelo da copa imortal, criação (wizard), abrangência nacional/continental, formato configurável, regras de qualificação (origens de liga e de copa, faixas de posição, prioridade), homogeneidade por_nome/clube, autorização (dono) e RLS das tabelas `cup_*`.
- `cup-editions`: ciclo de vida de uma edição — derivação de vagas a partir das origens encerradas, dedup por prioridade com queda para o próximo, ajuste manual de participantes, montagem (`montar_copa`), início via reuso do motor de torneio, e registro do campeão; ativação diferida.

### Modified Capabilities
<!-- Nenhuma. As copas reusam o motor de torneio (knockout-format, group-stage-format) e LEEM a classificação (standings-engine, league-pyramid) sem alterar seus requisitos. -->

## Impact

- **Banco (DDL — aplicada manualmente em PROD via MCP mostrando o SQL; espelhada em `supabase/schema.sql`)**: 4 tabelas novas (`cup_competitions`, `cup_qualification_rules`, `cup_seasons`, `cup_entries` — esta com `posicao_final` e `origem_season_id`), enums (`cup_format`, `cup_scope`, `cup_origin_type`, `cup_season_status`, `cup_competition_status`), RPC `montar_copa` (advisory lock namespace 2), RPCs DEFINER de leitura gated (`classificacao_final_divisao`, `classificacao_final_copa`), helper `eh_dono_cup`, trigger anti-ciclo, policies RLS, e `database.types.ts` atualizado à mão.
- **Server Actions** (`src/actions/`): criação de copa + regras (consentimento + anti-ciclo); derivação de vagas (lê `league_division_entries.posicao_final` / `cup_entries.posicao_final` via RPCs gated, NÃO `carregarLinhasBaseDivisao`); ajuste manual; montar/iniciar/encerrar edição; arquivar/apagar copa.
- **Features** (`src/features/cup/`): wizard, derivação (TS puro testável), componentes de edição/participantes/chave.
- **Schema Zod** (`src/schema/`): validação da copa, regras (compatibilidade por_nome), faixas e conservação mínima por formato.
- **Rotas** (`src/app/dashboard/copas/`): listagem, criação, página da copa e da edição.
- **Reuso sem alteração**: motor mata-mata (`gerarChaveMataMata`/`gerarChaveSemeada`), grupos (`gerarFaseDeGrupos`/`gerarFaseGruposSemeada`), `tournaments`/`tournament_slots`/`match` e suas RLS.
