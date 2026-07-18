# match-mutations Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Server Action de atualização de placar
O sistema SHALL fornecer uma Server Action `updateMatchScore` que recebe o ID da
partida e os placares finais e persiste o placar na tabela `matches`. Partida
`encerrada` NÃO SHALL aceitar alteração de placar — a action rejeita com mensagem
específica antes de tocar o banco.

O schema (`updateMatchScoreSchema`) SHALL aceitar um campo OPCIONAL `autores:
{lado:1|2, jogador, gols, contra}[]` onde `gols` é inteiro 1..99 e `contra` é
booleano (default `false`); quando `contra` é `false`, `jogador` é obrigatório
(`btrim` 1..60); quando `contra` é `true`, `jogador` é OPCIONAL (gol contra). A
soma de `gols` por lado — contando gols normais E gols contra — SHALL ser ≤ ao
placar daquele lado e um autor NÃO SHALL se repetir no mesmo lado com o mesmo
`contra` (case-insensitive) — violação retorna erro de validação sem gravar nada.

A gravação do placar E dos autores SHALL ser ATÔMICA: a action SHALL delegar a UMA
RPC `SECURITY DEFINER` (`aplicar_placar_direto`) que aplica placar, autores e a
poda de invariante DENTRO DE UMA ÚNICA TRANSAÇÃO. Uma falha em qualquer passo SHALL
reverter todos os anteriores — o placar NÃO SHALL persistir sem que os autores e a
invariante sejam consistentes com ele. A RPC SHALL ser o writer AUTORITATIVO: SHALL
reproduzir a autorização (participante do avulso OU quem arbitra o torneio) e o
endurecimento de parse (guards de tipo, range no numeric antes do cast, teto por
lado) internamente, já que é `definer` e alcançável por POST direto — Zod e RLS são
reforço, não a barreira.

O modal de lançamento DIRETO do organizador é uma superfície REPLACE: ele
PRÉ-CARREGA os autores atuais dos DOIS lados (`autoresIniciais`, agrupados por lado
e por `contra`) e, quando o organizador MEXE na captura, submete a lista COMPLETA.
Por isso, quando `autores` é INFORMADO (mesmo `[]`), a RPC SHALL reescrever os DOIS
lados em `match_goals` (delete dos dois lados + insert do conjunto endurecido),
preservando o `contra` de cada item. Um lado enviado VAZIO SHALL ESVAZIAR aquele
lado (o organizador vê o estado atual pelo preload, então limpar é intencional).
Distinção load-bearing: `autores` AUSENTE (`undefined`) SHALL preservar TODOS os
gols existentes (retrocompat — reabrir + re-lançar sem tocar na captura NÃO apaga a
artilharia colaborativa); `autores` ENVIADO (array, inclusive `[]`) SHALL
substituir os dois lados. A RPC SHALL impor a invariante `soma do lado ≤ placar do
lado` na mesma transação (poda de órfãos ao reduzir o placar sem enviar autores),
evitando gols acima do novo teto que corromperiam a foto durável do hall da fama.

A RPC SHALL aplicar uma GUARDA OTIMISTA de status: a action passa o `status` lido e
a RPC só aplica o placar quando a partida ainda NÃO está `encerrada` E o status
casa com o esperado; caso contrário SHALL sinalizar `PARTIDA_ENCERRADA` (quando de
fato encerrada) ou `PARTIDA_INDISPONIVEL` (quando a partida mudou sob o editor),
que a action traduz para mensagens pt-BR. Uma falha ao gravar/podar os autores
SHALL retornar erro (nunca `ok` silencioso).

#### Scenario: Atualização persistida
- **WHEN** o dono da partida envia placares válidos para partida não-encerrada
- **THEN** a partida é atualizada no banco pela RPC e o cache do dashboard é revalidado

#### Scenario: Partida encerrada rejeita placar
- **WHEN** um participante tenta salvar placar numa partida encerrada
- **THEN** a action retorna erro informando que a partida está encerrada, sem aplicar placar

#### Scenario: Gravação atômica placar + autores
- **WHEN** `updateMatchScore` aplica placar com `autores` e a materialização dos autores falharia (invariante ou erro no meio)
- **THEN** a transação inteira é revertida — nem o placar nem os `match_goals` mudam, deixando o estado ANTERIOR intacto

#### Scenario: Placar com autores enviado reescreve os DOIS lados (replace)
- **WHEN** `updateMatchScore` recebe placar e `autores` com entradas apenas do lado 1 (o lado 2 veio VAZIO)
- **THEN** o placar é salvo, o lado 1 de `match_goals` passa a refletir esses autores e o lado 2 é ESVAZIADO (o modal mostra os dois lados via preload — enviar o lado 2 vazio é limpar intencional)

#### Scenario: Autores excedendo o placar são rejeitados
- **WHEN** `updateMatchScore` recebe placar 1x0 e `autores` somando 2 gols no lado 1
- **THEN** a action retorna erro de validação e nem placar nem gols são alterados

#### Scenario: Placar sem autores não toca os gols
- **WHEN** `updateMatchScore` recebe placar sem o campo `autores`
- **THEN** só o placar é atualizado (RPC com `p_autores` nulo) e todos os gols existentes permanecem

#### Scenario: Reabrir e re-lançar sem autores preserva os gols
- **WHEN** uma partida com autores é reaberta e re-lançada via `updateMatchScore` sem o campo `autores`
- **THEN** os `match_goals` existentes (dos dois lados, incluindo gols contra) permanecem intactos

#### Scenario: Gol contra é preservado no lançamento direto
- **WHEN** `updateMatchScore` recebe autores incluindo um item com `contra = true`
- **THEN** o gol é gravado com `contra = true` (conta para o placar do lado, fora do ranking)

#### Scenario: Reduzir o placar de um lado omitido poda os gols órfãos daquele lado
- **WHEN** `updateMatchScore` REDUZ o placar de um lado (ex.: de 3 para 1) abaixo da soma de `match_goals` já gravada daquele lado, sem incluir os autores desse lado no payload
- **THEN** os `match_goals` daquele lado são removidos NA MESMA transação (invariante `soma do lado ≤ placar do lado` SEMPRE), evitando gols órfãos acima do novo teto que corromperiam a foto durável do hall da fama

#### Scenario: Guarda otimista contra edição concorrente
- **WHEN** entre a leitura da partida e a aplicação do placar o status da partida muda (outro editor)
- **THEN** a RPC não aplica o placar e a action retorna "a partida pode ter sido alterada; tente novamente", sem last-write-wins silencioso

### Requirement: Autorização por propriedade na action
A `updateMatchScore` SHALL verificar a identidade do usuário autenticado e SHALL rejeitar a transação com erro quando ele não for participante da partida. A RPC `aplicar_placar_direto` SHALL repetir essa autorização internamente (writer autoritativo, `definer` que bypassa RLS): SHALL permitir a escrita apenas ao participante do avulso OU a quem arbitra o torneio, sinalizando `NAO_AUTORIZADO` caso contrário — de modo que um POST direto que burle a UI e o Zod ainda é barrado no banco.

#### Scenario: Não dono rejeitado
- **WHEN** um usuário que não participa da partida invoca a action
- **THEN** a transação é rejeitada com erro e nenhum dado é alterado

#### Scenario: POST direto não autorizado barrado na RPC
- **WHEN** um usuário sem participação nem arbitragem chama `aplicar_placar_direto` diretamente (fora da UI)
- **THEN** a RPC sinaliza `NAO_AUTORIZADO` e nenhuma linha é escrita

### Requirement: Feedback de carregamento e sucesso
A UI SHALL refletir o estado de carregamento durante a action e SHALL emitir uma notificação de sucesso ao concluir.

#### Scenario: Estado de carregamento
- **WHEN** a action está em execução
- **THEN** o botão de salvar exibe estado de carregamento

#### Scenario: Notificação de sucesso
- **WHEN** a atualização conclui com sucesso
- **THEN** um toast de sucesso é exibido

### Requirement: Atribuição colaborativa de autores por lado
O sistema SHALL fornecer uma Server Action `registrarAutoresLado(matchId, lado,
autores, modo)` que embrulha a RPC `SECURITY DEFINER` `registrar_autores_lado(
p_match_id uuid, p_lado smallint, p_autores jsonb, p_modo text)`, permitindo
completar/corrigir os autores de gols de UM lado de uma partida COMPETITIVA,
inclusive com a partida ENCERRADA (caminho ADITIVO ao lançamento inicial de placar).
O payload por-lado SHALL ser `{jogador?: string|null, gols:1..99, contra:boolean}[]`,
com `jogador` obrigatório quando `contra = false` e opcional quando `contra = true`.

O MODO de escrita SHALL ser EXPLÍCITO (`p_modo` ∈ `{append, replace}`), NÃO inferido
do papel — para evitar o footgun dual-role (quem é árbitro E técnico do mesmo lado
usando o editor append cairia no replace por papel e apagaria os próprios gols). A
RPC SHALL exigir `auth.uid()`, `p_lado` ∈ {1,2}, `p_modo` válido (senão
`MODO_INVALIDO`); SHALL resolver o competitivo pela vaga do lado (`vaga_1` se `lado
= 1`, senão `vaga_2`) e recusar quando o lado não tem vaga. Autorização POR MODO:
`append` exige TÉCNICO daquele lado (`tournament_slots.user_id = auth.uid()`) OU
capacidade de ARBITRAR (`pode_arbitrar_torneio`); `replace` exige SOMENTE ARBITRAR.

No modo `append` os itens SHALL ser ADICIONADOS (somados por `(lado, contra, nome
normalizado)` ao já registrado), nunca reduzindo nem removendo. No modo `replace` o
payload SHALL ser a lista COMPLETA desejada, que SUBSTITUI as linhas daquele
`(match_id, lado)` (payload vazio esvazia o lado). A operação SHALL escrever APENAS
o lado indicado — NUNCA o lado oposto. A soma do lado (gols normais + gols contra,
existentes + adicionados) SHALL ser ≤ ao placar daquele lado; excedê-la SHALL
rejeitar (`TETO_LADO`). O parse SHALL ser endurecido (item malformado ignorado): o
RANGE de `gols` SHALL ser checado no `numeric` (precisão arbitrária) ANTES do cast
`::int`, de modo que nem um valor fracionário (`2.5`) nem gigante (`1e20`), forjados
por POST direto, abortem a chamada (`22P02`/`22003`) — o item fora de faixa é
IGNORADO. A RPC SHALL ter EXECUTE concedido a `authenticated` e
revogado de `public`/`anon`; a Server Action SHALL mapear os erros da RPC para
mensagens amigáveis e revalidar a página do torneio.

#### Scenario: Técnico completa o próprio lado (append) com a partida encerrada
- **WHEN** o técnico do lado 1 de uma partida encerrada chama `registrarAutoresLado(..., 'append')` adicionando um autor coerente com o placar
- **THEN** o autor é somado ao lado 1 sem tocar o lado 2, apesar de a partida estar encerrada

#### Scenario: Append soma, não substitui
- **WHEN** o lado já tem 1 gol e chega mais 1 gol de outro autor em modo `append`
- **THEN** os dois autores coexistem (soma), sem apagar o primeiro

#### Scenario: Árbitro substitui a lista do lado (replace)
- **WHEN** quem arbitra chama modo `replace` com a lista completa desejada de um lado
- **THEN** as linhas daquele `(match_id, lado)` passam a refletir exatamente a lista, sem tocar o outro lado

#### Scenario: Replace por técnico não-árbitro é recusado
- **WHEN** o técnico de um lado (sem arbitrar) chama modo `replace`
- **THEN** a RPC levanta `NAO_AUTORIZADO` e nada é gravado

#### Scenario: Modo inválido é recusado
- **WHEN** a RPC é chamada com `p_modo` fora de `{append, replace}`
- **THEN** a RPC levanta `MODO_INVALIDO` e nada é gravado

#### Scenario: Não-autorizado é recusado
- **WHEN** um usuário que não arbitra nem é técnico daquele lado chama a RPC (append)
- **THEN** a RPC levanta `NAO_AUTORIZADO` e nada é gravado

#### Scenario: Teto do lado barra excesso
- **WHEN** a soma (existentes + adicionados) do lado ultrapassa o placar do lado
- **THEN** a RPC rejeita a operação (`TETO_LADO`), sem gravar

#### Scenario: Gols fracionário forjado não aborta
- **WHEN** um POST direto envia `gols = 2.5` (que passa o guard de tipo `number`)
- **THEN** o valor é truncado por `floor` (→ 2), sem lançar `22P02` nem abortar a chamada

#### Scenario: Gols gigante forjado não aborta
- **WHEN** um POST direto envia `gols = 1e20` (passa o guard de tipo `number`, mas fora de 1..99)
- **THEN** o item é ignorado (range checado no `numeric` antes do `::int`), sem lançar `22003` nem abortar a chamada

#### Scenario: Lado sem vaga é recusado
- **WHEN** a RPC é chamada para um lado sem vaga (partida avulsa/lado vazio)
- **THEN** a RPC rejeita (`LADO_SEM_VAGA`, escopo competitivo)

