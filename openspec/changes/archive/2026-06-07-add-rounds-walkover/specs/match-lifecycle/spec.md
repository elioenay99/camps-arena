# match-lifecycle — Delta Spec

## ADDED Requirements

### Requirement: Reabrir partida limpa o W.O.
Ao reabrir uma partida (encerrada → aberta), o sistema SHALL limpar
`wo`/`wo_vencedor` quando a partida estava como W.O. (a CHECK de coerência
exige `wo_vencedor` nulo fora do estado encerrado-W.O.). As demais regras de
reabertura (congelamento de fase de chave, propriedade do dono) SHALL
permanecer.

#### Scenario: Reabrir um W.O. zera a marca
- **WHEN** o dono reabre uma partida que estava como W.O.
- **THEN** ela volta a aberta com `wo=false` e `wo_vencedor` nulo

#### Scenario: Congelamento de fase ainda barra
- **WHEN** o dono tenta reabrir um W.O. de uma fase cuja fase seguinte já foi
  gerada
- **THEN** a reabertura é negada como em qualquer partida de chave congelada
