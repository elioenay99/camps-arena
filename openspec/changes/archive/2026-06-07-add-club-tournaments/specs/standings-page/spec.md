# standings-page — Delta Spec

## MODIFIED Requirements

### Requirement: Fetcher de classificação
`getTournamentClassificacao` SHALL, em formatos competitivos, embedar as VAGAS dos lados (vaga → team nome/escudo + técnico id/nome/celular/avatar) numa única viagem, rodar os motores sobre slot ids e resolver o display como CLUBE (nome/escudo) com técnico como detalhe; partidas avulsas mantêm o caminho por participante. As projeções (linhas, partidasAbertas/Encerradas, chave, grupos, clubes) mantêm os contratos atuais com o lado competitivo resolvido por vaga; o celular continua restrito à projeção de partidas abertas.

#### Scenario: Linha da classificação é o clube
- **WHEN** o fetcher resolve um torneio competitivo
- **THEN** cada linha carrega nome/escudo do clube e o técnico atual (ou vaga aberta)

#### Scenario: Avulso inalterado
- **WHEN** o torneio é avulso
- **THEN** os lados continuam sendo pessoas como hoje
