# club-slots — Delta Spec

## ADDED Requirements

### Requirement: Vaga competitiva por nome (sem clube)

Uma vaga de torneio competitivo SHALL poder representar um competidor por NOME livre
(rótulo de texto) em vez de um clube real, governado por um toggle por torneio (todo
o torneio é de clubes OU de nomes, nunca misto). A vaga por nome NÃO SHALL ter clube,
técnico, dono nem convite de vaga: o organizador lança todos os placares. Os nomes
SHALL ser únicos por torneio (case-insensitive) e imutáveis após o início. A exibição
SHALL usar o nome com avatar de iniciais (sem escudo), e os motores de geração e a
autorização de placar permanecem inalterados (a vaga é um id opaco).

#### Scenario: Criar torneio por nome

- **WHEN** o dono cria um torneio competitivo com o modo "por nome" e digita os nomes
- **THEN** cada nome vira uma vaga sem clube e sem convite, e o torneio gera tabela/
  chave normalmente disputada por essas vagas

#### Scenario: Exibição da vaga por nome

- **WHEN** uma vaga por nome aparece na classificação, chave, partidas ou na lista de
  vagas
- **THEN** mostra o nome com avatar de iniciais, sem escudo, sem técnico e sem console
  de convite

#### Scenario: Lançamento de placar por nome

- **WHEN** o dono lança o placar de uma partida de um torneio por nome
- **THEN** o placar é registrado normalmente (o dono é a autoridade; não há técnico a
  convocar), e o W.O. automático não toca partidas sem técnico em ambos os lados
