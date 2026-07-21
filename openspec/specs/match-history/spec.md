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

### Requirement: Apresentação do histórico de partidas

A lista de partidas encerradas SHALL ser apresentada no idioma visual da
identidade (placar em tipografia display com `tabular-nums`, linhas com
profundidade sutil e realce no hover, badge de W.O. e indicações secundárias
refinadas), SEM alterar o conteúdo, a ordenação, os textos visíveis fixados
(`W.O.`, placar `N x N`, rótulo de rodada `RN`) nem o texto acessível
(`sr-only`) que descreve cada resultado. A superfície permanece Server Component.

Cada partida SHALL ser apresentada como um disclosure NATIVO (`<details>`/`<summary>`),
sem estado React e sem `"use client"`:

- A **linha principal** (`<summary>`) SHALL mostrar o rótulo de rodada (quando houver), o
  escudo de cada lado (`TeamCrest`, com fallback de iniciais quando não há escudo
  cadastrado), o **placar como elemento de maior peso visual da linha** e — de `sm:` para
  cima — o nome de cada lado e a data. No mobile o nome de cada lado SHALL permanecer no
  DOM, oculto apenas por CSS (`hidden sm:inline`). W.O. e W.O. duplo SHALL continuar
  sinalizados na linha principal (são resultado, não detalhe).
- O **corpo do disclosure** SHALL conter os nomes completos dos dois lados, a data (no
  mobile), os gols contra, o badge "faltam N artilheiros" e as AÇÕES da partida
  (artilheiros, compartilhar resultado, reabrir). NENHUM controle interativo
  (`<button>`/link) SHALL ficar dentro do `<summary>`.
- O `<summary>` SHALL ter alvo de toque de ao menos 44px de altura, marcador nativo
  removido e um indicador de estado (chevron) que reage a `[open]`.

Os gates de exibição das ações (`mostrarReabrir`, lado do técnico, capacidade de
arbitrar, presença de `tournamentId`) SHALL permanecer idênticos: a mudança é de
apresentação, não de autorização.

#### Scenario: Histórico vestido com a identidade

- **WHEN** o torneio tem partidas encerradas
- **THEN** cada linha aparece com o placar em tipografia display, profundidade
  sutil e o mesmo conteúdo (nomes, placar, data, rótulo de rodada quando houver)

#### Scenario: Apresentação não altera conteúdo nem acessibilidade

- **WHEN** uma partida encerrada por W.O. ou por placar é renderizada
- **THEN** os textos visíveis (`W.O.` ou `N x N`, `RN`) e o texto acessível
  (`Rodada N: Placar final…`, `W.O. — <nome> venceu`) permanecem como antes

#### Scenario: Ações recolhidas até o usuário abrir os detalhes

- **WHEN** o histórico é renderizado e o usuário ainda não tocou na partida
- **THEN** as ações (artilheiros, compartilhar resultado, reabrir) não estão visíveis, e
  passam a estar quando o disclosure é aberto

#### Scenario: Lado sem escudo cadastrado continua identificável

- **WHEN** um lado da partida não tem `escudo_url` (clube sem escudo, torneio por nome ou
  partida avulsa)
- **THEN** o lugar do escudo mostra as iniciais do nome com cor estável, e o nome segue no
  DOM (visível de `sm:` para cima)

### Requirement: Compartilhar resultado de uma partida encerrada

O histórico de partidas SHALL oferecer, no cluster de ações de cada partida
ENCERRADA, um botão "Compartilhar resultado" (client) que baixa o PNG da rota de
imagem do resultado (`fetch` same-origin) e o entrega via `compartilharWhatsApp`
(Web Share API com arquivo no mobile; fallback desktop: copiar texto + baixar +
`wa.me`), com o texto montado no servidor (`mensagemResultado`). O botão SHALL estar
disponível a qualquer usuário logado que enxerga a partida (não gated por papel de
organizador), espelhando `CompartilharRodadaButton`. Partidas não encerradas NÃO
SHALL exibir o botão.

#### Scenario: Compartilhar um resultado
- **WHEN** um usuário logado toca "Compartilhar resultado" numa partida encerrada
- **THEN** o card PNG do resultado é gerado e entregue ao seletor de compartilhamento com o texto do confronto

#### Scenario: Partida em andamento não oferece o botão
- **WHEN** a partida ainda não foi encerrada
- **THEN** o botão "Compartilhar resultado" não aparece

