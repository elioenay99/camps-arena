# knockout-format — Delta Spec

## ADDED Requirements

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
O sistema SHALL expor uma Server Action de início para torneio mata-mata que
recebe o MODO de chaveamento (`sorteio` | `potes` | `manual`) e o payload do
modo (cabeças de chave marcadas; ou confrontos montados). A action SHALL
conferir por FILTRO: dono, `formato = 'mata_mata'`, `status = 'rascunho'`.
Modo `potes` SHALL exigir N ∈ {4, 8, 16, 32} e exatamente N/2 cabeças. Modo
`manual` SHALL exigir que os confrontos particionem exatamente os participantes
confirmados (cada um aparece uma única vez; no máximo um lado vazio por
confronto). As partidas da 1ª fase SHALL ser inseridas em LOTE ÚNICO (com
`rodada`, `posicao` e, em ida-e-volta, as duas pernas de lados invertidos;
byes inseridos já `encerrada` 0×0) e só então o torneio promovido a `'ativo'`
(ordem falha-segura). Retry após falha parcial SHALL detectar partidas já
geradas e apenas promover. O modo NÃO SHALL ser persistido.

#### Scenario: Sorteio gera a chave e ativa
- **WHEN** o dono inicia um mata-mata em rascunho com N participantes em modo sorteio
- **THEN** a 1ª fase nasce com S/2 slots (byes já encerrados no slot sorteado) e o torneio fica `ativo`

#### Scenario: Potes com N fora de 4/8/16/32 é rejeitado
- **WHEN** o dono tenta iniciar por potes com 6 participantes
- **THEN** a action rejeita com mensagem clara e nada é inserido

#### Scenario: Manual com participante repetido ou faltando é rejeitado
- **WHEN** os confrontos montados repetem um participante ou deixam um confirmado de fora
- **THEN** a action rejeita por campo e nada é inserido

#### Scenario: Ida-e-volta gera duas pernas por confronto
- **WHEN** o mata-mata tem `ida_e_volta = true` e a fase gerada não é a final
- **THEN** cada confronto real vira duas partidas com a mesma posição, perna 1 e perna 2 com lados invertidos

#### Scenario: Dupla geração é barrada no banco
- **WHEN** duas requisições de início concorrem
- **THEN** apenas um lote é inserido (índice único por slot) e a outra recebe orientação de recarregar

#### Scenario: Não-dono, formato errado ou já iniciado é rejeitado
- **WHEN** a action é invocada por quem não é dono, em torneio não-mata-mata ou fora de rascunho
- **THEN** a resposta é um erro único, sem oráculo de existência

### Requirement: Avanço de fase pelo dono
O sistema SHALL expor a Server Action `avancarFase` que, conferindo dono +
`formato = 'mata_mata'` + `status = 'ativo'`, valida que TODAS as partidas da
fase atual (a maior `rodada` existente) estão `encerrada` e insere a fase
seguinte em lote único. Quando a fase atual é a semifinal e o torneio tem
`terceiro_lugar`, a final (posição 1) e a disputa de 3º lugar (posição 2, com
os perdedores) SHALL ser geradas juntas — o 3º lugar SOMENTE quando ambos os
confrontos da semifinal tiveram perdedor real (semifinal-bye não gera
perdedor). Quando a fase atual é a final, NÃO há o que avançar. Final e 3º
lugar SHALL ser jogo único mesmo com `ida_e_volta = true`.

#### Scenario: Fase completa avança
- **WHEN** o dono aciona Avançar fase com todas as partidas da fase atual encerradas
- **THEN** a fase seguinte nasce com os vencedores pareados por slot

#### Scenario: Fase incompleta não avança
- **WHEN** há partida da fase atual não-encerrada (incluindo perna pendente)
- **THEN** a action rejeita com mensagem clara e nada é inserido

#### Scenario: Semifinal gera final e 3º lugar
- **WHEN** o torneio tem `terceiro_lugar = true` e as duas semifinais encerram com perdedores reais
- **THEN** o avanço insere a final e a disputa de 3º lugar com os perdedores das semifinais

#### Scenario: Semifinal com bye não gera 3º lugar
- **WHEN** uma das semifinais é bye (N = 3) e o torneio pede 3º lugar
- **THEN** apenas a final é gerada

#### Scenario: Avanço duplicado é barrado
- **WHEN** o dono aciona Avançar fase duas vezes (clique duplo ou corrida)
- **THEN** o segundo lote falha no índice único e a action responde "fase já avançada"

#### Scenario: Torneio com final encerrada tem campeão
- **WHEN** a final está encerrada
- **THEN** a página exibe o campeão e Avançar fase não é oferecido

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
Torneio de formato `mata_mata` SHALL rejeitar criação manual de partida nos
mesmos pontos da liga (action, RLS via exigência de `rodada`, rotas com 404,
seletor de torneios) e SHALL rejeitar aceite de convite quando o `status` não
é `rascunho` (chave já gerada — entrar depois deixaria o participante fora da
chave).

#### Scenario: createMatch rejeita mata-mata
- **WHEN** `createMatch` referencia torneio de formato `mata_mata`
- **THEN** a action rejeita com a mensagem de formato gerado

#### Scenario: Aceite após início é rejeitado
- **WHEN** `aceitar_convite` é chamada para mata-mata com status diferente de rascunho
- **THEN** a função rejeita com mensagem clara e a página de convite já explicava o bloqueio

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
