# match-engagement — Delta Spec

## ADDED Requirements

### Requirement: Contato (`celular`) resolvido por co-participação

O `celular` que alimenta o atalho de convocação e o texto/imagem da rodada NÃO SHALL mais
ser embutido nos embeds PostgREST de `users`. Os fetchers (`getActiveMatches`,
`getTournamentClassificacao`, `getPerfil`) SHALL obter o `celular` exclusivamente pela RPC
gated `public.celulares_de_contato(uuid[])`, que só devolve o número de co-participantes (ou
do próprio usuário). A reinjeção SHALL preservar o contrato consumido a jusante
(`participante_1/2.celular`, `tecnico.celular`, `contato.celular`) sem alterar a UX para
quem é co-participante.

Como consequência, um logado que NÃO compartilha torneio com um competidor — inclusive ao
visualizar um torneio PÚBLICO de terceiros — SHALL ver nomes, placares e a estrutura, mas
NÃO SHALL receber o telefone de ninguém (o atalho/`wa.me` não é renderizado para ele). A
contenção de PII por fronteira RSC permanece.

#### Scenario: Convocação preservada para o co-participante

- **WHEN** o dono/adversário (co-participante) abre o dashboard ou a página do torneio
- **THEN** o `celular` chega via `celulares_de_contato` e o atalho `wa.me` aparece como antes

#### Scenario: Torneio público sem vazar telefone

- **WHEN** um logado não-participante abre um torneio público avulso
- **THEN** ele vê os nomes e os placares, mas nenhum `celular`/atalho de WhatsApp é exposto
