# tournament-management — Delta Spec

## ADDED Requirements

### Requirement: Página de detalhe do torneio organizada em abas

A página de detalhe do torneio (`/dashboard/torneios/[id]`) SHALL organizar suas seções em ABAS,
em vez de empilhá-las num scroll único, agrupadas por assunto: **Classificação**, **Partidas**,
**Rodadas** e **Vagas** (ou **Participantes** no avulso). As abas SHALL ser DINÂMICAS — uma aba só
aparece quando há conteúdo que o usuário pode ver. A aba **Classificação** SHALL ser o padrão. O
**cabeçalho** (nome, status, identidade/cores, "Nova partida") e a **Administração** do torneio
(equipe, encerrar, reabrir) SHALL permanecer FORA das abas, fixos no topo. O carregamento de
dados e TODOS os gates por papel (gerir/arbitrar/moderar) e por formato SHALL permanecer no
Server Component da página; a troca de aba SHALL ser client-side, sem recarregar a página nem
refazer as consultas, e SHALL preservar a contenção de PII (nada de celular cru cruzando a
fronteira servidor→cliente).

#### Scenario: Abas dinâmicas conforme conteúdo e papel

- **WHEN** um torneio de liga ativo é aberto pelo organizador
- **THEN** aparecem as abas Classificação (padrão), Partidas, Rodadas e Vagas

#### Scenario: Aba sem conteúdo é omitida

- **WHEN** o espectador não-organizador não tem cadência de rodadas a liberar
- **THEN** a aba "Rodadas" não é exibida

#### Scenario: Cabeçalho e administração fora das abas

- **WHEN** qualquer aba está ativa
- **THEN** o cabeçalho do torneio e os controles de administração permanecem visíveis no topo

#### Scenario: Troca de aba não recarrega a página

- **WHEN** o usuário alterna entre abas
- **THEN** a troca é instantânea (estado client), sem nova navegação nem refetch das seções
