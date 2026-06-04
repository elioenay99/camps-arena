# match-history Specification

## Purpose
TBD - created by archiving change add-match-history. Update Purpose after archive.
## Requirements
### Requirement: Histórico de partidas encerradas do torneio
A página do torneio SHALL exibir, abaixo da classificação, a lista das partidas encerradas com os nomes dos participantes, o placar final e a data de encerramento (aproximada pelo último lançamento, `updated_at`), ordenadas da mais recente para a mais antiga. Partidas não encerradas NÃO SHALL aparecer no histórico. Sem partida encerrada, a seção SHALL ser omitida.

#### Scenario: Resultados listados com placar e data
- **WHEN** o torneio tem partidas encerradas
- **THEN** cada uma aparece como "participante placar x placar participante" com a data em formato pt-BR, da mais recente para a mais antiga

#### Scenario: Partidas em aberto não aparecem
- **WHEN** o torneio tem partidas agendadas ou em andamento
- **THEN** elas não constam do histórico

#### Scenario: Participante indefinido em partida encerrada
- **WHEN** uma partida encerrada tem lado sem participante
- **THEN** o lado aparece como "A definir" (registro fiel, não ocultado)

#### Scenario: Sem encerradas, sem seção
- **WHEN** o torneio não tem partida encerrada
- **THEN** a seção de histórico não é renderizada

