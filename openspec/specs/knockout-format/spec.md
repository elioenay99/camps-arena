# knockout-format Specification

## Purpose
TBD - created by archiving change add-knockout-format. Update Purpose after archive.
## Requirements
### Requirement: Motor puro de chaveamento eliminatório
O sistema SHALL prover um motor PURO (zero IO) em `src/features/knockout/` que:
(a) monta os slots da chave inicial a partir da lista de participantes segundo
o modo — `sorteio` (embaralhamento Fisher-Yates com gerador de aleatoriedade
INJETADO pelo chamador), `potes` (cabeças de chave separadas dos demais, cada
confronto cruza um de cada grupo, posições sorteadas com o mesmo gerador) e
`manual` (confrontos fornecidos pelo chamador); (b) computa o tamanho da chave
S = menor potência de 2 >= N e distribui B = S − N byes com no máximo um bye
por confronto; (c) computa o vencedor de um confronto encerrado (bye →
`participante_1`; jogo único → placar; ida-e-volta → agregado) e gera os
confrontos da fase seguinte pelo pareamento fixo "vencedor do slot 2i−1 ×
vencedor do slot 2i → slot i"; (d) calcula a prévia (jogos reais, fases) por
fórmula fechada — a MESMA fonte alimenta motor e UI; (e) rotula as fases pelo
número de confrontos (1 = Final, 2 = Semifinais, 4 = Quartas de final,
8 = Oitavas de final, demais = "fase N").

#### Scenario: Chave de N qualquer com byes
- **WHEN** o motor monta a chave para N participantes com N entre 2 e 32 e N não é potência de 2
- **THEN** a chave tem S/2 confrontos na 1ª fase, S − N deles com bye (um lado vazio), e nenhum confronto tem dois lados vazios

#### Scenario: Sorteio é determinístico dado o gerador
- **WHEN** o motor monta a chave em modo sorteio com um gerador de aleatoriedade fixo
- **THEN** a chave resultante é sempre a mesma (testável sem mock de crypto)

#### Scenario: Potes cruzam cabeças com não-cabeças
- **WHEN** o motor monta a chave em modo potes com S/2 cabeças e S/2 demais
- **THEN** todo confronto da 1ª fase tem exatamente uma cabeça de chave

#### Scenario: Vencedores semeiam a fase seguinte por slot
- **WHEN** a fase com slots 1..2k está toda decidida
- **THEN** a fase seguinte tem k confrontos, onde o slot i recebe os vencedores dos slots 2i−1 e 2i

#### Scenario: Agregado decide em ida-e-volta
- **WHEN** um confronto tem perna 1 e perna 2 encerradas
- **THEN** o vencedor é o lado com maior soma de gols nas duas pernas (sem gol fora)

#### Scenario: Prévia bate com a chave gerada
- **WHEN** a prévia é calculada para qualquer N entre 2 e 32, com e sem ida-e-volta e 3º lugar
- **THEN** o total de jogos reais e fases confere com a simulação da chave correspondente

#### Scenario: Entradas inválidas são rejeitadas
- **WHEN** o motor recebe menos de 2 participantes, mais de 32, ids duplicados, ou potes com tamanhos desiguais
- **THEN** lança erro descritivo sem produzir chave

### Requirement: Iniciar torneio mata-mata com modo de chaveamento
O início do mata-mata SHALL operar sobre VAGAS (slot ids no motor; partidas com vaga_1/vaga_2; bye = vaga_2 nula persistida como hoje), mantendo os três modos de chaveamento, byes e validações atuais. NÃO SHALL exigir técnicos presentes; a pré-checagem de semeados em participants morre (vagas pertencem ao torneio por construção, validadas pela policy de INSERT).

#### Scenario: Chave entre vagas com bye
- **WHEN** um mata-mata de 5 clubes inicia
- **THEN** a chave nasce entre vagas com os byes persistidos (vaga_2 nula) como antes

### Requirement: Avanço de fase pelo dono
O avanço SHALL decidir confrontos por vaga vencedora e inserir a fase seguinte entre VAGAS, mantendo todas as regras atuais (fases relativas, 3º lugar, 23505, congelamento de reabertura).

#### Scenario: Vencedores avançam como vagas
- **WHEN** o dono avança a fase
- **THEN** os confrontos seguintes pareiam as vagas vencedoras

### Requirement: Resultado decisivo obrigatório
O sistema NÃO SHALL permitir encerrar partida decisiva de mata-mata sem
vencedor: jogo único (perna nula, não-bye) NÃO SHALL encerrar com
`placar_1 = placar_2`; a perna 2 de um confronto ida-e-volta NÃO SHALL
encerrar antes da perna 1 estar encerrada NEM com agregado empatado (o placar
da volta embute prorrogação/pênaltis). A perna 1 MAY encerrar empatada. A
regra SHALL valer na Server Action (mensagem pt-BR precisa) e em trigger no
banco (`service_role` isento), contra POST direto.

#### Scenario: Jogo único empatado não encerra
- **WHEN** o dono tenta encerrar uma partida de mata-mata de jogo único com placar igual
- **THEN** a action rejeita explicando que eliminatória exige vencedor; o trigger bloqueia o POST direto

#### Scenario: Perna 1 pode empatar
- **WHEN** o dono encerra a perna 1 empatada
- **THEN** o encerramento é aceito

#### Scenario: Volta com agregado empatado não encerra
- **WHEN** o dono tenta encerrar a perna 2 com soma de gols igual nas duas pernas
- **THEN** a action rejeita orientando embutir a decisão no placar; o trigger bloqueia o POST direto

#### Scenario: Volta antes da ida não encerra
- **WHEN** o encerramento da perna 2 é tentado com a perna 1 ainda aberta
- **THEN** a operação é rejeitada com mensagem clara

### Requirement: Reabertura bloqueada após avanço
O sistema NÃO SHALL permitir reabrir partida de mata-mata quando o torneio já
possui partida em fase posterior (o vencedor está semeado adiante — reabrir
tornaria a chave incoerente). Partida-bye NÃO SHALL ser reaberta em hipótese
alguma. A regra SHALL valer na action e no trigger.

#### Scenario: Reabrir fase já avançada é rejeitado
- **WHEN** o dono tenta reabrir uma partida de fase anterior à fase atual
- **THEN** a action rejeita explicando que a fase seguinte já foi gerada; o trigger bloqueia o POST direto

#### Scenario: Reabrir na fase atual é permitido
- **WHEN** o dono reabre uma partida da fase mais recente, antes de avançar
- **THEN** a reabertura segue o fluxo normal de correção

#### Scenario: Bye não reabre
- **WHEN** a reabertura é tentada numa partida-bye
- **THEN** a operação é rejeitada

### Requirement: Mata-mata não aceita partida manual nem adesão tardia
Partida manual segue bloqueada em formatos gerados. A adesão SHALL ser por convite de VAGA e — diferente do modelo anterior — SHALL valer também com o torneio ATIVO (assumir clube órfão/substituição); o que não existe mais é entrar como pessoa avulsa fora de vaga.

#### Scenario: Assumir clube com a chave em andamento
- **WHEN** alguém aceita o convite de uma vaga órfã com o torneio ativo
- **THEN** assume o clube e herda as partidas da chave

### Requirement: Visualização da chave
A página do torneio mata-mata SHALL exibir a CHAVE (componente RSC puro): uma
coluna por fase com rótulo (Oitavas/Quartas/Semifinais/Final/3º lugar), cada
confronto com nomes e placar (agregado por perna em ida-e-volta), byes
rotulados como avanço direto, fases futuras ainda não geradas indicadas como
"a definir", e o CAMPEÃO destacado quando a final encerra. A chave SHALL
substituir a tabela de classificação por pontos e a classificação de clubes
(sem sentido em eliminatória). O container SHALL permitir overflow horizontal
em telas pequenas.

#### Scenario: Chave renderizada por fases
- **WHEN** um usuário abre a página de um mata-mata iniciado
- **THEN** vê as fases geradas com confrontos, placares e rótulos, e as fases futuras como a definir

#### Scenario: Bye rotulado
- **WHEN** a chave contém um confronto-bye
- **THEN** o item mostra o participante avançando direto, sem placar 0×0 cru

#### Scenario: Campeão destacado
- **WHEN** a final está encerrada
- **THEN** a página destaca o vencedor como campeão

#### Scenario: Sem classificação por pontos
- **WHEN** a página de um torneio mata-mata renderiza
- **THEN** não há tabela de pontos corridos nem classificação de clubes

### Requirement: Painel de início do mata-mata
A página do torneio SHALL exibir, para o dono de mata-mata em `rascunho`, o
painel de início com a prévia (jogos e fases para o N atual, refletindo
ida-e-volta e 3º lugar) e a escolha do modo de chaveamento: sorteio (submissão
direta), potes (marcação de cabeças de chave entre os participantes
confirmados) e manual (montagem dos confrontos com selects). Com menos de 2
participantes o painel SHALL orientar a convidar. O painel NÃO SHALL aparecer
para não-donos nem após o início.

#### Scenario: Dono escolhe o modo e inicia
- **WHEN** o dono de um mata-mata em rascunho com participantes suficientes abre a página
- **THEN** vê a prévia e os três modos; iniciar pelo modo escolhido gera a chave

#### Scenario: Potes exigem marcação válida
- **WHEN** o dono escolhe potes e marca um número de cabeças diferente de N/2
- **THEN** a action rejeita com mensagem clara

#### Scenario: Painel some após iniciar
- **WHEN** o torneio sai de rascunho
- **THEN** o painel de início não renderiza mais

### Requirement: Integridade de slot no banco
O banco SHALL garantir: `posicao >= 1` e `perna IN (1,2)` quando presentes
(CHECKs); unicidade de slot por índice único parcial em
`(tournament_id, rodada, posicao, perna)` com `NULLS NOT DISTINCT` (sem isso,
`perna` nula duplicaria slots de jogo único); imutabilidade de `posicao` e
`perna` via trigger `lock_match_relations` (mesmo regime de
participantes/rodada; `service_role` isento).

#### Scenario: Slot duplicado é rejeitado
- **WHEN** um INSERT tenta gravar segunda partida no mesmo (torneio, rodada, posição, perna) — inclusive perna nula
- **THEN** o índice único rejeita a operação

#### Scenario: Posição ou perna inválida é rejeitada
- **WHEN** uma escrita tenta `posicao < 1` ou `perna` fora de 1/2
- **THEN** a CHECK rejeita a operação

#### Scenario: Renumerar slot por POST direto é barrado
- **WHEN** um UPDATE tenta alterar `posicao` ou `perna` de uma partida
- **THEN** o trigger bloqueia a operação

