## Why

Hoje, num torneio/liga, o **jogador/técnico** de uma vaga lança o placar DIRETO
(`updateMatchScore`, RLS `matches_update_participant`) e o admin/árbitro apenas **encerra**
depois. Não há prova do resultado: o dono confia no número que o técnico digitou. O dono pediu
que, quando **quem NÃO é admin** (não tem capacidade de arbitrar) reporta um **placar** ou um
**W.O.**, isso vire uma **proposta** que o admin **aprova** — e o placar venha **obrigatoriamente
com uma foto de evidência**.

## What Changes

- **Placar (não-admin)**: deixa de ser escrito direto. O técnico, no menu da partida, ajusta o
  placar, **anexa uma foto (obrigatória)** e envia → cria uma **proposta pendente**. RLS
  `matches_update_participant` é estreitada para **só avulso** (o técnico competitivo não escreve
  mais a partida direto).
- **W.O. (não-admin)**: reusa o fluxo existente `solicitarWO`/`responderWO`, agora aceitando uma
  **foto (opcional)** anexa à solicitação.
- **Aprovação (dono/admin/árbitro)**: nova seção "Resultados pendentes" lista as propostas com
  placar e miniatura da foto. **Aprovar** aplica o placar e **encerra** a partida (1 passo);
  **rejeitar** (com motivo) devolve para o técnico reenviar. O W.O. segue pelo responder existente.
- **Admin lança direto sem foto**: `updateMatchScore` passa a aceitar também quem tem capacidade de
  **arbitrar** (dono/admin/árbitro), que continua encerrando como hoje.
- **Evidência**: bucket **privado** `match_evidence`; a foto é vista por uma **rota autenticada**
  que autoriza (aprovador OU jogador) e devolve uma URL assinada gerada com o **client da sessão**
  (sem `service_role` no runtime; a autorização é uma policy SELECT do bucket privado).

## Capabilities

### Added Capabilities
- **match-result-approval**: proposta de placar com foto obrigatória; aprovação aplica+encerra;
  rejeição com motivo; quem aprova = capacidade arbitrar; evidência privada por rota autorizada.

### Modified Capabilities
- **match-score-modal**: no competitivo, o não-admin vê "Enviar para aprovação" + anexo de foto
  (em vez de "Salvar placar" direto); o aprovador mantém o lançamento direto.
- **match-walkover**: a solicitação de W.O. passa a aceitar foto (opcional) exibida ao aprovador.

## Impact

- **DDL (PROD via MCP mostrando o SQL + LOCAL via psql; espelhada em `supabase/schema.sql`):**
  tabela `match_score_proposals` (+ índice único parcial de 1 pendente por técnico/partida),
  coluna `foto_path` em `match_wo_requests` (nullable), bucket `match_evidence` + policies de
  storage, ajuste da policy `matches_update_participant` (avulso-only), policies da nova tabela.
- **Sem regressão no avulso** (participantes seguem lançando direto). **Torneios/ligas**: o
  técnico passa pela aprovação; o admin/árbitro aprova ou lança direto.
- Segurança em profundidade: RLS + checagem nas actions + autorização na rota da evidência.
