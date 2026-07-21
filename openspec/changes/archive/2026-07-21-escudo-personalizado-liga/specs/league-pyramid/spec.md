## ADDED Requirements

### Requirement: Escudo personalizado do competidor por liga

Cada competidor da pirâmide (`league_competitors`) SHALL poder ter um escudo próprio,
válido SOMENTE dentro daquela liga. O catálogo global de clubes (`public.teams`) SHALL
permanecer inalterado: trocar o escudo em uma liga NÃO SHALL afetar nenhuma outra liga nem
nenhum outro usuário.

O escudo efetivo de um competidor SHALL ser `coalesce(<escudo do competidor>, <escudo do
clube no catálogo>)`. Quando não há override, o comportamento SHALL ser idêntico ao atual.
Competidor por NOME (sem clube do catálogo) SHALL poder ter escudo próprio; sem override,
SHALL continuar caindo no monograma de iniciais.

Apenas quem tem a capacidade GERIR da liga (dono OU membro com papel `admin`) SHALL poder
definir ou remover o escudo. A verificação SHALL existir em duas camadas: pré-check na
Server Action e RLS no banco como backstop.

Remover o override SHALL restaurar o escudo do catálogo.

#### Scenario: Dono troca o escudo de um clube na liga dele

- **WHEN** o dono da liga envia uma imagem para um competidor
- **THEN** todas as superfícies daquela liga passam a mostrar o escudo enviado, e o mesmo
  clube em qualquer outra liga continua com o escudo do catálogo

#### Scenario: Admin da liga também pode

- **WHEN** um membro com papel `admin` define o escudo de um competidor
- **THEN** a operação é aceita

#### Scenario: Quem não gere não pode

- **WHEN** um usuário sem capacidade GERIR tenta definir ou remover o escudo de um
  competidor
- **THEN** a operação é recusada com a mesma mensagem de "não encontrado ou sem acesso"
  usada no resto do projeto, sem revelar se o competidor existe

#### Scenario: Remover volta ao catálogo

- **WHEN** o gestor remove o escudo personalizado
- **THEN** o competidor volta a exibir o escudo do clube no catálogo (ou o monograma de
  iniciais, se o clube não tiver escudo)

### Requirement: Resolução do escudo efetivo em todas as superfícies da liga

Toda superfície que desenha escudo de um competidor de liga SHALL resolver o escudo
efetivo, incluindo classificação, partidas (abertas e encerradas), rodada, vagas do
torneio, artilharia, muralha, rivais, perfil do competidor, perfil do técnico, painel de
partidas ativas, copa vinculada, cards OG e a tela de convite de vaga.

A resolução SHALL usar o ponteiro `competitor_id` que a vaga (`tournament_slots`) e a
entrada de copa (`cup_entries`) já carregam — sem query adicional por render.

Quando `competitor_id` é `null` (torneio avulso ou legado, entrada de copa manual ou
por-nome), a superfície SHALL exibir exatamente o escudo do catálogo, como hoje.

#### Scenario: Override aparece na classificação e nas partidas

- **WHEN** um competidor com escudo personalizado joga na liga
- **THEN** classificação, lista de partidas, página da rodada e cards OG mostram o escudo
  personalizado

#### Scenario: Copa vinculada herda o override

- **WHEN** uma edição de copa recebe um participante herdado de uma divisão da liga
- **THEN** o participante aparece com o escudo personalizado daquela liga

#### Scenario: Torneio avulso não regride

- **WHEN** um torneio avulso (sem pirâmide) é renderizado
- **THEN** os escudos continuam vindo do catálogo, sem erro e sem query extra

### Requirement: Envio do escudo personalizado

O envio SHALL acontecer na página de **Identidade** da liga
(`/dashboard/ligas/[id]/cores`), sem rota nova, com o fluxo escolher arquivo → pré-visualizar
→ salvar → feedback via `sonner`, e uma ação de remover disponível quando há override.

A imagem SHALL ser reduzida no cliente antes do envio, de modo que caiba no limite do
bucket e que metadados EXIF (inclusive GPS) não sejam preservados.

O servidor SHALL aceitar apenas `image/png` e `image/webp`, SHALL validar os bytes reais do
arquivo (magic bytes) e SHALL recusar quando o conteúdo não corresponder ao tipo declarado.
O `contentType` gravado no Storage SHALL derivar do tipo DETECTADO, nunca do informado pelo
cliente.

A interface SHALL ser utilizável a 390px, com alvos de toque de ao menos 44px.

#### Scenario: Foto do celular é aceita

- **WHEN** o gestor escolhe uma foto de vários megabytes pelo celular
- **THEN** a imagem é reduzida antes do envio e o upload é aceito

#### Scenario: Arquivo que mente sobre o tipo é recusado

- **WHEN** um arquivo declara `image/png` mas seus bytes não são de uma imagem PNG/WEBP
  válida
- **THEN** o envio é recusado com mensagem em pt-BR e nada é gravado

#### Scenario: SVG não entra

- **WHEN** o arquivo é um SVG
- **THEN** o envio é recusado
