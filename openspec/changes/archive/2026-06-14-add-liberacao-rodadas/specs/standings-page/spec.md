# standings-page — Delta Spec

## ADDED Requirements

### Requirement: Classificação parcial do não-dono

A classificação exibida ao **não-dono** SHALL refletir apenas as rodadas já liberadas,
porque ela é calculada sobre as partidas que a RLS devolve. Resultados de rodadas ainda
ocultas NÃO SHALL vazar pela tabela, nem pela lista de partidas, nem pela chave. Para o
**dono**, a classificação SHALL continuar refletindo todas as partidas (ele vê tudo).

O gating da RLS SHALL valer uniformemente, mas o ALCANCE prático da "tabela parcial" no v1
é o torneio standalone: a página da divisão de liga (`ligas/[id]`) e os fetchers
`getDivisionStandings`/`getDivisionClassificacaoCombinada` são lidos SÓ pelo dono
(`getSeason` filtra por `created_by`), e divisões de pirâmide nascem liberadas — logo não há
"tabela combinada parcial do não-dono". A única superfície de não-dono numa liga é a
**página do torneio da divisão** (`torneios/[id]`, que pode ser pública), coberta pela
mesma regra do torneio standalone. O comentário do fetcher que afirmava receber "todas" as
partidas do torneio SHALL ser corrigido para refletir que o conjunto retornado depende da
liberação para o não-dono.

#### Scenario: Tabela do não-dono só conta rodadas liberadas

- **WHEN** um visitante abre um torneio com rodadas liberadas e ocultas
- **THEN** a classificação soma só os jogos das rodadas liberadas; o resultado das ocultas
  não aparece em lugar nenhum da página

#### Scenario: Tabela do dono é completa

- **WHEN** o dono abre o mesmo torneio
- **THEN** a classificação reflete todas as partidas, liberadas ou não

#### Scenario: Ao liberar, a tabela do não-dono se atualiza

- **WHEN** o dono libera uma rodada cujos jogos já foram disputados
- **THEN** a classificação do não-dono passa a incluir esses resultados (após recarregar a
  página — o realtime não injeta partidas recém-liberadas, só atualiza as já em tela)

### Requirement: Estado de rodadas não liberadas para o não-dono

A página do torneio SHALL exibir, para o não-dono de um torneio ATIVO cujas rodadas estão
todas ocultas (cadência manual, zero rodadas liberadas), um aviso explícito de que **as
próximas rodadas ainda não foram liberadas pelo organizador** — em vez dos empty-states que
afirmam que o torneio ainda não começou ("a chave/grupos aparecem quando o torneio for
iniciado", "a classificação aparece depois da primeira partida encerrada"), que seriam
enganosos e criariam um beco-sem-saída.

A condição SHALL ser derivada do estado do TORNEIO (não da ausência de partidas, que o
não-dono não distingue de "não iniciado"): torneio com `status = 'ativo'`, sem partidas
visíveis ao solicitante, e solicitante não-dono ⇒ aviso de "rodadas não liberadas". Para o
torneio em rascunho (não iniciado) os empty-states atuais SHALL permanecer. Para o dono
(que vê tudo), nada muda.

#### Scenario: Não-dono vê aviso de rodadas não liberadas

- **WHEN** um não-dono abre um torneio ativo cujas rodadas estão todas ocultas
- **THEN** a página exibe "As próximas rodadas ainda não foram liberadas pelo organizador",
  e não os empty-states de torneio não iniciado

#### Scenario: Rascunho mantém o empty-state de não iniciado

- **WHEN** um usuário abre um torneio ainda em rascunho
- **THEN** os empty-states atuais ("aparece quando o torneio for iniciado") permanecem

#### Scenario: Liberação parcial mostra o que há e sinaliza o resto

- **WHEN** o dono já liberou algumas rodadas mas mantém outras ocultas
- **THEN** o não-dono vê a classificação/partidas das rodadas liberadas normalmente (sem o
  aviso de bloqueio total)

## MODIFIED Requirements

### Requirement: Apresentação da lista de partidas em aberto

A lista de partidas em aberto da página do torneio SHALL ser apresentada no idioma visual
da identidade (placar em tipografia display com `tabular-nums`, linhas com profundidade
sutil e realce no hover, status da partida em indicação discreta, cabeçalho de rodada em
tipografia display com marcador decorativo), SEM alterar o agrupamento por rodada, os
controles por papel (encerrar, marcar/solicitar W.O., fechar rodada, atalho de convocação),
os textos visíveis fixados (`RN`, `(vaga aberta)`), os papéis/nomes acessíveis (heading
`Rodada N`, rótulos de botão) nem o texto acessível. A superfície permanece Server Component
(a contenção de PII do celular depende disso).

Adicionalmente, para o **dono**, a página SHALL oferecer os controles de **liberação de
rodadas** (uma seção "Liberação de rodadas" com o estado por rodada — liberada/oculta — e
os botões *Liberar próxima rodada*, *Liberar próximas N*, *Liberar fase de grupos* nos
formatos com grupos e *Liberar tudo* com confirmação). Esses controles SHALL aparecer só
para o dono e só quando houver rodadas (formatos gerados, não avulso). O fetcher
`getTournamentClassificacao` SHALL derivar, a partir das partidas que o dono enxerga, o
estado de liberação por rodada e a próxima rodada oculta para alimentar essa seção.

#### Scenario: Lista em aberto vestida com a identidade

- **WHEN** o usuário abre um torneio competitivo com partidas em aberto
- **THEN** as linhas aparecem com placar em tipografia display e profundidade sutil,
  agrupadas por rodada com cabeçalho `Rodada N` e o botão "Fechar rodada" na rodada ativa
  (para o dono), como antes

#### Scenario: Apresentação preserva papéis e contenção de PII

- **WHEN** a lista renderiza para quem joga e para o dono
- **THEN** os controles por papel e o atalho de convocação aparecem conforme hoje, os nomes
  acessíveis permanecem, e o componente segue como Server Component (sem `"use client"`)

#### Scenario: Dono vê os controles de liberação

- **WHEN** o dono abre um torneio gerado com rodadas ocultas
- **THEN** a seção "Liberação de rodadas" lista o estado de cada rodada e oferece os botões
  de liberação; um não-dono não vê essa seção
