## ADDED Requirements

### Requirement: Classificação de clubes do torneio
A página do torneio SHALL exibir a classificação dos clubes (`time_1`/`time_2`) das partidas encerradas, calculada pelo mesmo motor e com as mesmas regras de pontuação do torneio. Partidas sem os dois clubes definidos NÃO SHALL pontuar nesta tabela. Sem clube pontuado, a seção SHALL ser omitida.

#### Scenario: Clubes pontuam pelas regras do torneio
- **WHEN** partidas encerradas têm os dois clubes definidos
- **THEN** a tabela de clubes mostra pontos, jogos, V/E/D, gols e saldo pela mesma cadeia de desempate

#### Scenario: Partida sem clube não pontua
- **WHEN** uma partida encerrada não tem um (ou ambos) os clubes definidos
- **THEN** ela não afeta a tabela de clubes (mas segue pontuando na de participantes)

#### Scenario: Sem clubes, sem seção
- **WHEN** nenhuma partida encerrada tem os dois clubes definidos
- **THEN** a seção de clubes não é renderizada
