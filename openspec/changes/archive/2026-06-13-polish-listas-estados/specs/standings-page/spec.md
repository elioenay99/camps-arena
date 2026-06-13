# standings-page — Delta Spec

## ADDED Requirements

### Requirement: Apresentação da lista de partidas em aberto

A lista de partidas em aberto da página do torneio SHALL ser apresentada no
idioma visual da identidade (placar em tipografia display com `tabular-nums`,
linhas com profundidade sutil e realce no hover, status da partida em indicação
discreta, cabeçalho de rodada em tipografia display com marcador decorativo),
SEM alterar o agrupamento por rodada, os controles por papel (encerrar, marcar/
solicitar W.O., fechar rodada, atalho de convocação), os textos visíveis fixados
(`RN`, `(vaga aberta)`), os papéis/nomes acessíveis (heading `Rodada N`, rótulos
de botão) nem o texto acessível. A superfície permanece Server Component (a
contenção de PII do celular depende disso).

#### Scenario: Lista em aberto vestida com a identidade

- **WHEN** o usuário abre um torneio competitivo com partidas em aberto
- **THEN** as linhas aparecem com placar em tipografia display e profundidade
  sutil, agrupadas por rodada com cabeçalho `Rodada N` e o botão "Fechar rodada"
  na rodada ativa (para o dono), como antes

#### Scenario: Apresentação preserva papéis e contenção de PII

- **WHEN** a lista renderiza para quem joga e para o dono
- **THEN** os controles por papel e o atalho de convocação aparecem conforme
  hoje, os nomes acessíveis permanecem, e o componente segue como Server
  Component (sem `"use client"`)

### Requirement: Estado de carregamento da página do torneio

Enquanto a página do torneio carrega, o sistema SHALL exibir um esqueleto que
ESPELHA a geometria real (cabeçalho do torneio + cabeçalho de seção + tabela de
classificação) para reduzir layout shift, com região acessível de carregamento
(`role="status"`, `aria-live`, texto `sr-only`). Por ser um boundary anterior à
busca (sem conhecer o formato), o esqueleto SHALL representar o caso dominante
(classificação por tabela); o conteúdo já carregado substitui o esqueleto.

#### Scenario: Skeleton espelha a página

- **WHEN** os dados do torneio ainda estão sendo buscados
- **THEN** um esqueleto com cabeçalho-hero e tabela de classificação aparece no
  lugar do conteúdo, anunciado a leitores de tela

#### Scenario: Conteúdo substitui o esqueleto

- **WHEN** os dados terminam de carregar
- **THEN** a página real (classificação, chave ou grupos conforme o formato)
  substitui o esqueleto
