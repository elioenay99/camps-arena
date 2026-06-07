# standings-page — Delta Spec

## MODIFIED Requirements

### Requirement: Fetcher de classificação
O sistema SHALL prover `getTournamentClassificacao` que busca o torneio (com regras, formato, opções de formato e `created_by`) e as partidas com nomes embutidos numa única viagem por recurso, executa o motor e devolve as linhas com nome resolvido, a lista de partidas encerradas (`partidasEncerradas`), a classificação de clubes (`clubes`), as partidas em aberto (`partidasAbertas`), a chave (partidas com `posicao`) E as partidas de grupos com seus números de grupo (insumo das tabelas por grupo). A consulta de partidas SHALL incluir `posicao`, `perna` e `grupo` (mesma viagem — todas as projeções derivam do mesmo snapshot) e os embeds de participantes SHALL incluir `celular` — consumido SOMENTE pela projeção `partidasAbertas` (ids e celulares dos lados, insumo do atalho de convocação; o histórico e as demais projeções NÃO o carregam). Torneio não retornado pela RLS SHALL resultar em `null`; falha de query SHALL lançar erro amigável.

#### Scenario: Nomes resolvidos a partir dos embeds
- **WHEN** as partidas retornam embeds de participantes com nomes
- **THEN** cada linha da classificação carrega o nome correspondente (fallback "Sem nome")

#### Scenario: Torneio oculto pela RLS
- **WHEN** a query do torneio devolve vazio
- **THEN** o fetcher devolve null sem consultar partidas

#### Scenario: Todas as projeções do mesmo snapshot
- **WHEN** o fetcher retorna
- **THEN** classificação, histórico, clubes, partidas em aberto, chave e grupos derivam da MESMA consulta de partidas

#### Scenario: Celular só nas partidas em aberto
- **WHEN** o fetcher projeta as listas
- **THEN** apenas `partidasAbertas` carrega ids e celulares dos lados; as demais projeções não expõem o dado
