# match-history — Delta Spec

## ADDED Requirements

### Requirement: Apresentação do histórico de partidas

A lista de partidas encerradas SHALL ser apresentada no idioma visual da
identidade (placar em tipografia display com `tabular-nums`, linhas com
profundidade sutil e realce no hover, badge de W.O. e indicações secundárias
refinadas), SEM alterar o conteúdo, a ordenação, os textos visíveis fixados
(`W.O.`, placar `N x N`, rótulo de rodada `RN`) nem o texto acessível
(`sr-only`) que descreve cada resultado. A superfície permanece Server Component.

#### Scenario: Histórico vestido com a identidade

- **WHEN** o torneio tem partidas encerradas
- **THEN** cada linha aparece com o placar em tipografia display, profundidade
  sutil e o mesmo conteúdo (nomes, placar, data, rótulo de rodada quando houver)

#### Scenario: Apresentação não altera conteúdo nem acessibilidade

- **WHEN** uma partida encerrada por W.O. ou por placar é renderizada
- **THEN** os textos visíveis (`W.O.` ou `N x N`, `RN`) e o texto acessível
  (`Rodada N: Placar final…`, `W.O. — <nome> venceu`) permanecem como antes
