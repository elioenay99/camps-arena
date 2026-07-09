## ADDED Requirements

### Requirement: W.O./0×0 limpa os autores de gols da partida (trigger atômico)
Um W.O. força 0×0 (partida sem gols), então os `match_goals` daquela partida SHALL
ser removidos — para que gols antigos (de um placar anterior, antes de uma
reabertura) NÃO sobrevivam a um W.O. e continuem poluindo o ranking de artilharia e
a carreira do competidor (que agregam por competidor/nome e NÃO filtram por `wo`). A
remoção SHALL ser feita por um TRIGGER `AFTER UPDATE` em
`public.matches` (`matches_limpar_gols_wo`) que dispara quando a partida PASSA a
`wo = true` e `status = 'encerrada'` (`when new.wo = true and new.status =
'encerrada' and (old.wo is distinct from new.wo or old.status is distinct from
new.status)`), NÃO por deletes app-layer espalhados. Isso SHALL ser ATÔMICO com o
UPDATE que grava o W.O. (fechando a janela de corrida contra um
`aprovar_proposta_placar` concorrente) e SHALL cobrir num único lugar TODOS os
caminhos de W.O. (simples, duplo, auto-W.O. de órfão ao fechar a rodada, aceite de
solicitação). A função do trigger SHALL ser `SECURITY DEFINER` (ignora a policy de
DELETE de `match_goals`, que exigiria `status <> 'encerrada'`). Um encerramento
NORMAL (`wo = false`) NÃO SHALL disparar o trigger — os autores são PRESERVADOS.

#### Scenario: W.O. após reabertura apaga os gols antigos
- **WHEN** uma partida encerrada 3×1 com autores registrados é reaberta e depois marcada como W.O. (0×0)
- **THEN** o trigger remove os `match_goals` daquela partida no mesmo passo do encerramento, e nenhum autor antigo aparece no ranking/carreira

#### Scenario: Duplo W.O. também limpa os gols
- **WHEN** uma partida com autores registrados vira duplo W.O. (0×0 para ambos)
- **THEN** o trigger remove os `match_goals` da partida

#### Scenario: Encerramento normal preserva os autores
- **WHEN** uma partida é encerrada normalmente (com placar, `wo = false`) tendo autores registrados
- **THEN** o trigger NÃO dispara e os `match_goals` permanecem (o cerne da feature)

#### Scenario: W.O. sem gols prévios é inócuo
- **WHEN** uma partida sem nenhum `match_goals` é marcada como W.O.
- **THEN** o registro do W.O. conclui normalmente (o delete do trigger é um no-op)
