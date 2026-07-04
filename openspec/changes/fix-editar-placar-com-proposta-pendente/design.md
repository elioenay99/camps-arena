## Contexto

A change `add-proposta-resultado-foto` (spec `match-result-approval`) criou duas superfícies
de resultado para o competitivo: (1) o técnico de vaga PROPÕE placar + foto (proposta pendente);
(2) quem ARBITRA aprova/rejeita na seção "Resultados pendentes" (`PropostasPendentes`). Aprovar
aplica o placar e ENCERRA a partida no mesmo passo. Em paralelo, o organizador que arbitra
também tem o editor DIRETO de placar ("Editar placar" → `updateMatchScore`), sem foto, no
`OpenMatchesList` (gate `mostrarEncerrar`).

O problema: essas duas superfícies coexistem para a MESMA partida. Nada impede o organizador de
gravar o placar direto por cima de uma proposta ainda pendente. Não é falha de segurança (a RLS
e a action autorizam corretamente), é inconsistência de FLUXO: a proposta fica órfã e o técnico
segue vendo "aguardando aprovação".

## Decisão 1 — gate de UX na lista + guarda no servidor (defesa em profundidade)

O gate na lista (`OpenMatchesList`) é APRESENTAÇÃO: esconde o console do organizador quando há
proposta pendente. Mas a Server Action é alcançável fora da UI (POST direto, aba velha aberta
antes da proposta chegar), então adicionamos uma GUARDA no servidor em `updateMatchScore`: antes
do UPDATE, se houver proposta pendente para a partida, recusa limpo com mensagem clara. As duas
camadas se reforçam — a UI evita o caminho ruim; a action fecha a corrida e substitui o
"unexpected response" (skew de Server Action no repro) por uma mensagem de produto legível.

Escopo da guarda: só o caminho NÃO-avulso (`!ehAvulso`). No modelo do banco, partida avulsa e
competitiva são mutuamente exclusivas (CHECK); propostas só existem no competitivo. Escopar
evita uma viagem extra ao banco no caminho avulso comum. A guarda é uma leitura (SELECT) — não
toca dados, sem DDL.

## Decisão 2 — onde vem o conjunto de pendências

`OpenMatchesList` é RSC puro e já recebe as partidas prontas. A page do torneio JÁ busca
`propostasPendentes` (via `getPropostasPendentes`, condicional a `ehGerado`), mas o tipo
`PropostaPendente` não expunha o `matchId` — só `id` (da proposta), placares e nomes dos lados.
Adicionamos `matchId` ao fetcher (a coluna FK `match_id` já vem no embed `matches!...!inner`;
trazê-la é aditivo) e montamos o Set na page. Passar um `Set<string>` (não a lista de propostas)
mantém o `OpenMatchesList` desacoplado do shape de `PropostaPendente` — ele só precisa do
predicado "esta partida tem pendência?".

Importante: `propostasPendentes` só é buscado quando `ehGerado` E `podeArbitrarPartidas` (a RLS
só entrega as linhas a quem arbitra). Fora disso é `[]` → Set vazio → o gate é no-op. Ou seja: o
gate só afeta a visão de quem arbitra, exatamente onde o botão "Editar placar" existe.

## Decisão 3 — o que gatear e o que mostrar no lugar

Gateamos os três controles de CONSOLE DO ORGANIZADOR da partida: "Editar placar" (o pedido
explícito), "Encerrar" e "W.O.". Racional: encerrar ou dar W.O. com proposta pendente é tão
inconsistente quanto editar direto (encerraria 0×0 ou por ausência, ignorando o placar
proposto). E o organizador não perde caminho: aprovar a proposta JÁ encerra a partida. O
"Chamar" (WhatsApp) e o "Solicitar W.O." de quem JOGA permanecem — não são console de
organizador e não conflitam com a proposta.

No lugar dos botões, um indicador discreto (`text-muted-foreground` + ícone `Clock`, tokens do
projeto): "Aguardando aprovação de placar". Curto, comunica o estado e aponta para a seção de
aprovação sem inventar UI nova.

## Decisão 4 — o "Fechar rodada" NÃO é gateado por partida

O botão "Fechar rodada" (no cabeçalho da rodada, via `RoundPager`) é uma ação de RODADA, não de
partida — gateá-lo por uma pendência individual seria errado (a rodada pode ter várias partidas,
só uma com proposta). Fechar a rodada varre órfãos e é um caminho legítimo mesmo com uma proposta
pendente numa das partidas (o organizador decide). Fora de escopo aqui.

## Fora de escopo

- Investigar/consertar o erro em inglês do repro (skew de Server Action; um refresh resolve) —
  a guarda no servidor já substitui esse texto por uma mensagem de produto quando o gatilho é a
  proposta pendente.
- Gate do "Fechar rodada" por pendência.

## Riscos

- **Nenhum de dados.** Sem DDL/migration.
- **Regressão visual**: só partidas COM proposta pendente mudam (botões → indicador). Partidas
  sem pendência renderizam byte-idênticas — coberto por testes discriminantes (a mutação que
  remove o gate faz o teste "não renderiza Editar placar" falhar) + gate mecânico.
