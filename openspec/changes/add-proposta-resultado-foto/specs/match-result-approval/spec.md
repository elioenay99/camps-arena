## ADDED Requirements

### Requirement: Proposta de placar com foto pelo não-admin

O sistema SHALL exigir que, em campeonatos competitivos (torneio/liga), um técnico de vaga sem
capacidade de arbitrar envie uma proposta de placar pendente, com foto de evidência obrigatória,
em vez de gravar o placar da partida diretamente. O técnico competitivo SHALL ser impedido de
gravar o placar direto (a RLS de participante passa a valer só para o avulso). Cada técnico SHALL
ter no máximo uma proposta pendente por partida (reenviar substitui a própria pendente).

#### Scenario: Técnico envia placar com foto

- **WHEN** o técnico de uma vaga ajusta o placar e anexa uma foto no menu da partida
- **THEN** é criada uma proposta pendente com o placar e a foto, sem alterar o placar oficial da partida

#### Scenario: Placar sem foto é recusado

- **WHEN** o técnico tenta enviar a proposta de placar sem anexar foto
- **THEN** o envio é recusado (a foto é obrigatória)

#### Scenario: Técnico competitivo não grava placar direto

- **WHEN** um técnico de vaga tenta gravar o placar da partida competitiva diretamente
- **THEN** a operação é negada (RLS/ação); o caminho é a proposta com aprovação

### Requirement: Aprovação aplica o placar e encerra; rejeição devolve

Quem tem capacidade de **arbitrar** (dono/admin/árbitro) SHALL ver as propostas pendentes e poder
**aprovar** ou **rejeitar**. Aprovar uma proposta de placar SHALL aplicar o placar proposto e
**encerrar** a partida no mesmo passo (reusando as regras de encerramento: varredura de órfãos da
rodada e validação de mata-mata), e SHALL resolver as demais propostas pendentes da partida.
Rejeitar SHALL registrar um **motivo** e devolver para o técnico poder reenviar. O aprovador SHALL
continuar podendo **lançar o placar diretamente** (sem foto) e encerrar como antes.

#### Scenario: Aprovar aplica e encerra

- **WHEN** o aprovador aprova uma proposta de placar pendente
- **THEN** o placar proposto vira o placar oficial e a partida é encerrada; as outras propostas pendentes daquela partida são resolvidas

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
