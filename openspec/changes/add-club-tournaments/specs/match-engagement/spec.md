# match-engagement — Delta Spec

## MODIFIED Requirements

### Requirement: Atalho de convocação nas superfícies de listagem
O atalho "Chamar" SHALL continuar restrito a quem joga a partida, agora resolvido por VAGA nos formatos competitivos: o botão aparece para o TÉCNICO de uma das vagas, apontando ao celular do TÉCNICO da vaga adversária (mensagem cita o clube adversário e o torneio). Vaga adversária órfã ou sem celular SHALL omitir o botão. Partidas avulsas mantêm o comportamento atual. A contenção de PII por fronteira RSC permanece.

#### Scenario: Convocar o técnico do clube adversário
- **WHEN** o técnico de um clube vê sua partida aberta e o técnico adversário tem celular
- **THEN** o atalho abre o WhatsApp do adversário com a mensagem de convocação

#### Scenario: Clube órfão não gera atalho
- **WHEN** a vaga adversária está sem técnico
- **THEN** nenhum botão é renderizado
