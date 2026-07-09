# match-result-approval Specification

## Purpose
TBD - created by archiving change add-proposta-resultado-foto. Update Purpose after archive.
## Requirements
### Requirement: Proposta de placar com foto pelo não-admin

O sistema SHALL exigir que, em campeonatos competitivos (torneio/liga), um técnico de vaga sem
capacidade de arbitrar envie uma proposta de placar pendente, com foto de evidência obrigatória,
em vez de gravar o placar da partida diretamente. O técnico competitivo SHALL ser impedido de
gravar o placar direto (a RLS de participante passa a valer só para o avulso). Cada técnico SHALL
ter no máximo uma proposta pendente por partida (reenviar substitui a própria pendente).

A proposta SHALL poder carregar OPCIONALMENTE os autores dos gols (`autores:
{lado, jogador, gols, contra}[]`, mesma validação do lançamento direto — `gols`
1..99, soma por lado ≤ placar contando gols normais E gols contra, sem duplicata no
lado com o mesmo `contra`; `jogador` `btrim` 1..60 obrigatório quando `contra =
false` e opcional quando `contra = true`), guardados na coluna
`match_score_proposals.autores` até a resolução. O técnico NÃO SHALL escrever
`match_goals` diretamente (a RLS nega); os autores só entram na tabela oficial na
aprovação.

#### Scenario: Técnico envia placar com foto

- **WHEN** o técnico de uma vaga ajusta o placar e anexa uma foto no menu da partida
- **THEN** é criada uma proposta pendente com o placar e a foto, sem alterar o placar oficial da partida

#### Scenario: Placar sem foto é recusado

- **WHEN** o técnico tenta enviar a proposta de placar sem anexar foto
- **THEN** o envio é recusado (a foto é obrigatória)

#### Scenario: Técnico competitivo não grava placar direto

- **WHEN** um técnico de vaga tenta gravar o placar da partida competitiva diretamente
- **THEN** a operação é negada (RLS/ação); o caminho é a proposta com aprovação

#### Scenario: Proposta carrega autores dos gols

- **WHEN** o técnico envia a proposta com autores de gols válidos
- **THEN** os autores ficam guardados na proposta (coluna `autores`), sem tocar `match_goals` ainda

#### Scenario: Proposta carrega gol contra

- **WHEN** o técnico envia a proposta com um autor `contra = true`
- **THEN** o `contra` fica guardado no jsonb `autores` da proposta, sem tocar `match_goals` ainda

### Requirement: Aprovação aplica o placar e encerra; rejeição devolve

Quem tem capacidade de **arbitrar** (dono/admin/árbitro) SHALL ver as propostas pendentes e poder
**aprovar** ou **rejeitar**. Aprovar uma proposta de placar SHALL aplicar o placar proposto e
**encerrar** a partida no mesmo passo (reusando as regras de encerramento: varredura de órfãos da
rodada e validação de mata-mata), e SHALL resolver as demais propostas pendentes da partida.
Rejeitar SHALL registrar um **motivo** e devolver para o técnico poder reenviar. O aprovador SHALL
continuar podendo **lançar o placar diretamente** (sem foto) e encerrar como antes.

A aprovação SHALL, no MESMO passo atômico (RPC SECURITY DEFINER
`aprovar_proposta_placar`), materializar os autores guardados na proposta em
`match_goals`, agregando por `(lado, contra, nome normalizado)` e PRESERVANDO o
`contra` de cada autor, de modo que placar e autores fiquem consistentes. A escrita
SHALL ser POR-LADO: o delete-then-insert SHALL tocar APENAS os LADOS GOVERNADOS pela
proposta (os que têm item válido dentro do teto); um lado AUSENTE do `autores` da
proposta — ex.: a artilharia colaborativa do adversário — NÃO SHALL ser deletado.
A materialização SHALL distinguir DOIS casos vazios, ambos PRESERVANDO o já
registrado: `autores` NULO ("não informado") NÃO SHALL tocar nenhum lado; `autores`
igual a `[]` (lista vazia → "nenhum lado governado") também NÃO SHALL apagar nada —
em particular NÃO SHALL limpar a artilharia colaborativa da partida (mudança
DELIBERADA frente ao comportamento arquivado, em que "proposta sem autores limpava").
ESVAZIAR um lado agora é ação de `registrar_autores_lado` `modo='replace'` com lista
vazia daquele lado (quem arbitra), não da aprovação. O teto por lado da
materialização SHALL contar gols normais E gols contra, e o parse SHALL ser
endurecido (item malformado ignorado; RANGE de `gols`/`lado` checado no `numeric`
ANTES do `::int`, sem abortar com `22P02`/`22003`). A rejeição SHALL descartar os
autores propostos junto com a proposta.

#### Scenario: Aprovar aplica e encerra

- **WHEN** o aprovador aprova uma proposta de placar pendente
- **THEN** o placar proposto vira o placar oficial e a partida é encerrada; as outras propostas pendentes daquela partida são resolvidas

#### Scenario: Aprovar materializa os autores atomicamente

- **WHEN** o aprovador aprova uma proposta que trazia autores de gols
- **THEN** os autores viram linhas em `match_goals` no mesmo passo em que o placar é aplicado e a partida encerrada

#### Scenario: Aprovar preserva o gol contra

- **WHEN** o aprovador aprova uma proposta cujos autores incluíam um `contra = true`
- **THEN** a linha materializada em `match_goals` mantém `contra = true` (conta para o placar do lado, fora do ranking), sem virar gol normal

#### Scenario: Aprovar proposta de um lado não apaga o lado oposto colaborativo

- **WHEN** o adversário já completou colaborativamente os autores do lado 2 e o aprovador aprova uma proposta que traz autores apenas do lado 1
- **THEN** o lado 1 é materializado da proposta e os autores do lado 2 permanecem intactos (materialização por-lado)

#### Scenario: Aprovar proposta sem autores preserva os gols existentes

- **WHEN** o aprovador aprova uma proposta cujo `autores` é nulo (o técnico não atribuiu)
- **THEN** os `match_goals` já registrados da partida permanecem (a materialização não apaga nada)

#### Scenario: Aprovar proposta com autores vazios preserva a artilharia colaborativa

- **WHEN** o aprovador aprova uma proposta cujo `autores` é `[]` (lista vazia) numa partida que já tem autores colaborativos registrados
- **THEN** nenhum lado é governado e os `match_goals` existentes permanecem (o `[]` NÃO limpa o match — esvaziar um lado é feito por `registrar_autores_lado` replace)

#### Scenario: Reduzir o placar de um lado omitido poda os gols órfãos daquele lado

- **WHEN** a aprovação REDUZ o placar de um lado (ex.: de 3 para 1) abaixo da soma de `match_goals` já gravada daquele lado, e a proposta NÃO governa esse lado (`autores` nulo ou só do lado oposto)
- **THEN** os `match_goals` daquele lado são REMOVIDOS no mesmo passo (invariante `soma do lado ≤ placar do lado` SEMPRE), para que nenhum gol órfão acima do novo teto sobreviva e seja materializado na foto durável do hall da fama

#### Scenario: Rejeitar com motivo

- **WHEN** o aprovador rejeita uma proposta informando o motivo
- **THEN** a proposta fica rejeitada com o motivo e o técnico pode enviar uma nova

#### Scenario: Aprovador lança direto sem foto

- **WHEN** o dono/admin/árbitro lança o placar pelo menu da partida
- **THEN** o placar é gravado diretamente, sem exigir foto

### Requirement: Evidência privada vista só por aprovadores e pelos dois jogadores

A foto de evidência SHALL ser guardada em armazenamento **privado** (bucket `match_evidence`, sem
leitura pública) e servida por uma **rota autenticada** que autoriza o solicitante e só então devolve
a imagem (via URL assinada de curta duração gerada com o **client da sessão**, sem chave de serviço no
runtime). A autorização SHALL seguir a visibilidade da origem: para o **placar**, SHALL ver a foto
quem tem capacidade de **arbitrar** OU é um dos **dois jogadores** (técnicos) da partida; para o
**W.O.**, SHALL ver quem arbitra OU o **solicitante**. Qualquer outro SHALL receber 404, sem oráculo.

#### Scenario: Aprovador vê a evidência

- **WHEN** um aprovador abre a foto de uma proposta
- **THEN** a imagem é exibida (rota autorizada → URL assinada)

#### Scenario: Terceiro não vê a evidência

- **WHEN** alguém que não arbitra nem joga a partida tenta acessar a foto
- **THEN** recebe 404 (sem revelar a existência da evidência)

### Requirement: Organizador não edita placar direto com proposta pendente

A UI do organizador (quem tem capacidade de **arbitrar**) NÃO SHALL oferecer a edição direta de
placar de uma partida quando existe uma **proposta de placar PENDENTE** para ela — o caminho
SHALL ser aprovar ou rejeitar a proposta na seção de resultados pendentes. O componente
`OpenMatchesList` (`src/features/match/components/OpenMatchesList.tsx`) SHALL receber o conjunto
das partidas com proposta pendente (`matchesComPropostaPendente: Set<string>`, derivado na page
do torneio a partir de `getPropostasPendentes`, cujo `PropostaPendente` SHALL expor `matchId`) e,
para toda partida cujo id pertença ao conjunto, SHALL ESCONDER os controles de console do
organizador daquela partida — "Editar placar", "Encerrar" e "W.O." — exibindo no lugar um
indicador discreto ("Aguardando aprovação de placar").

Esta é uma proteção de UX: a autorização real permanece na Server Action `updateMatchScore` + na
RLS. O conjunto SHALL ser vazio (gate no-op) fora da visão de quem arbitra um campeonato gerado
(a RLS de `match_score_proposals` só entrega as linhas ao aprovador, e a page só busca as
propostas quando `ehGerado` e a capacidade de arbitrar está presente). Partidas SEM proposta
pendente SHALL renderizar exatamente como antes (botões preservados). Os controles que NÃO são
console de organizador — o atalho "Chamar" (WhatsApp) e o "Solicitar W.O." de quem joga a
partida — SHALL permanecer inalterados, assim como o "Fechar rodada" (ação de rodada, não de
partida).

#### Scenario: Partida com proposta pendente esconde a edição direta

- **WHEN** o organizador vê uma partida competitiva cujo id está no conjunto de partidas com
  proposta pendente
- **THEN** os botões "Editar placar", "Encerrar" e "W.O." dessa partida NÃO são exibidos, e no
  lugar aparece o indicador "Aguardando aprovação de placar"

#### Scenario: Partida sem pendência preserva os controles

- **WHEN** o organizador vê uma partida competitiva cujo id NÃO está no conjunto de partidas com
  proposta pendente
- **THEN** os controles do console do organizador ("Editar placar", "Encerrar", "W.O.") são
  exibidos normalmente, como antes desta mudança

#### Scenario: Fetcher expõe o matchId da proposta

- **WHEN** `getPropostasPendentes` monta a lista de propostas pendentes de um torneio
- **THEN** cada `PropostaPendente` inclui o `matchId` da partida à qual a proposta se refere,
  permitindo à page derivar o conjunto de partidas com pendência

### Requirement: Edição direta de placar é recusada no servidor com proposta pendente

A Server Action `updateMatchScore` (`src/actions/match.ts`) SHALL recusar a gravação DIRETA de
placar de uma partida competitiva quando existe uma **proposta de placar PENDENTE** para ela,
retornando `{ok:false, error:"..."}` com mensagem clara (aprovar/rejeitar antes de editar direto)
em vez de gravar por cima da proposta. Esta é a defesa em profundidade que fecha a corrida da
aba velha / POST direto (a UI já esconde o botão, mas a action é alcançável fora dela). A
verificação SHALL rodar ANTES do UPDATE e SHALL ser escopada ao caminho NÃO-avulso (o avulso não
tem propostas), para não custar uma viagem extra ao banco no caminho comum. O placar SHALL
permanecer inalterado quando a recusa ocorre.

#### Scenario: Árbitro é recusado ao editar direto com proposta pendente

- **WHEN** quem arbitra tenta gravar o placar direto de uma partida competitiva que tem uma
  proposta de placar pendente
- **THEN** `updateMatchScore` retorna `{ok:false}` com mensagem pedindo aprovar/rejeitar a
  proposta antes, e NENHUM UPDATE é feito

#### Scenario: Sem proposta pendente, a gravação direta segue normal

- **WHEN** quem arbitra grava o placar direto de uma partida competitiva SEM proposta pendente
- **THEN** o placar é gravado normalmente (a guarda não intercepta)

