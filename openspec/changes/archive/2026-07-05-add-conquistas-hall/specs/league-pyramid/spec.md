## ADDED Requirements

### Requirement: Encerrar a temporada materializa os troféus antes do flip final
`confirmarFluxoTemporada` — o único caminho de encerrar uma temporada — SHALL,
após congelar o resultado por competidor (entries) e ANTES do write final que
marca a season `encerrada`, com a season ainda em `em_fluxo`, chamar
`registrar_conquistas_temporada` para materializar os troféus daquela temporada
(campeão/vice/promovido/rebaixado e artilheiro derivados das entries/`match_goals`;
campeão/vice de mata-mata via `resultadoDaChave` e melhor ataque/defesa/sequência
via `calcularDestaques`, passados no payload). O flip para `encerrada` SHALL ser o
ÚLTIMO write. Ao montar o payload, a action SHALL traduzir os ids chaveados por
SLOT (dos motores) para `competitor_id` (via `league_division_entries` /
`rechavearInsights`) — payload com slot ids faria a RPC descartar os prêmios em
silêncio. Uma falha na materialização SHALL ser tratada como falha recuperável do
fluxo (que, ainda em `em_fluxo`, reexecuta idempotente no re-run), NÃO deixando a
estante vazia de forma permanente.

#### Scenario: Premiação ocorre antes de virar encerrada
- **WHEN** o dono confirma o fim de uma temporada
- **THEN** os troféus são materializados com a season ainda em `em_fluxo`, e só então a season vira `encerrada`

#### Scenario: Falha na premiação não trava a estante para sempre
- **WHEN** a materialização falha após o flip nunca ter ocorrido (season em `em_fluxo`)
- **THEN** re-executar o fluxo reexecuta a premiação idempotente, sem cair em early-return de `encerrada`

#### Scenario: Re-execução do fluxo não duplica troféus
- **WHEN** o encerramento é re-executado (resume em `em_fluxo`)
- **THEN** os troféus da temporada são regravados sem duplicar (delete-then-insert)

### Requirement: Pôster e push best-effort no encerramento da temporada
Ao encerrar uma temporada, o sistema SHALL disponibilizar um pôster
compartilhável "Temporada encerrada" (campeão da elite + quem subiu/caiu) e SHALL
disparar um push best-effort aos participantes (gated por co-participação),
sempre aguardado (`await`) antes de qualquer redirecionamento/revalidação. Uma
falha ao gerar o pôster ou ao enviar o push NÃO SHALL derrubar o encerramento.

#### Scenario: Push não bloqueia o encerramento
- **WHEN** o envio de push falha ou não há VAPID configurada
- **THEN** o encerramento conclui normalmente e o resultado da temporada é persistido

#### Scenario: Pôster de temporada encerrada disponível
- **WHEN** a temporada é encerrada
- **THEN** existe uma imagem compartilhável com o campeão e os promovidos/rebaixados
