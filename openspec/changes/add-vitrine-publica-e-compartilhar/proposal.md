## Why

Hoje o Goliseu **não tem descoberta**: uma competição só aparece para quem a
CRIOU ou PARTICIPA dela. O índice de torneios (`/dashboard/torneios`) e o de
ligas (`/dashboard/ligas`) filtram por `created_by`/participação e **nunca**
mostram competições de terceiros — mesmo a RLS já liberando a leitura de qualquer
liga `ativa` e de qualquer torneio `is_public` para qualquer usuário logado
(fundação entregue em `add-liga-visao-leitura`, com a visão read-only da página).
Não há como um usuário navegar pelas competições públicas da comunidade.

Também **não existe um "compartilhar" no nível da competição**: o padrão de
compartilhar (Web Share no celular, copiar no desktop) só cobre a RODADA e a
LISTA DE TIMES dentro da visão de partidas (`CompartilharRodadaButton`,
`CompartilharListaTimesButton`). O organizador não tem um botão para divulgar o
link da própria liga/torneio.

O dono quer duas coisas coesas: (1) uma **vitrine pública** ("Explorar") das
competições que o organizador optou por listar, e (2) um botão **"Compartilhar"**
na página da liga e do torneio.

## What Changes

Três peças coesas:

1. **Flag opt-in `listada`** (`boolean not null default false`) em `tournaments`
   E `league_competitions`. Um **toggle "Listar na vitrine pública"** na área de
   GESTÃO (só `podeGerir`) da página da liga e do torneio. No torneio o toggle só
   aparece quando `!ehDivisao` (uma divisão se lista pela liga-mãe, nunca sozinha).
   Persistência via Server Action nova gateada por `podeGerir`; a escrita é na
   própria linha, coberta pela RLS de update do dono já existente (sem RLS nova).
2. **Aba "Explorar"** no menu do dashboard → nova página `/dashboard/explorar`
   (RSC; `redirect(login)` se `!user`). Um loader lista as **ligas `ativa` com
   `listada=true`** e os **torneios `is_public` de TOPO (não-divisão) com
   `listada=true`**, de QUALQUER usuário, cada um como card (título, formato,
   status, cores do campeonato, dono) com link para a visão read-only. Estado
   vazio orienta que ainda não há competição pública.
3. **Botão "Compartilhar"** na página da liga e do torneio, visível **só a
   `podeGerir`**, compartilhando o link canônico da página pelo MESMO padrão do
   `CompartilharRodadaButton` (Web Share no celular, copiar no desktop).

## Capabilities

### New Capabilities

- `public-discovery`: a vitrine pública "Explorar" (página + entrada de
  navegação + loader) que agrega as competições opt-in de qualquer usuário.

### Modified Capabilities

- `tournament-management`: a página do torneio ganha o toggle "listar na vitrine"
  (só gestor, só torneio de topo) e o botão "compartilhar" (só gestor).
- `league-pyramid`: a página da temporada ganha o toggle "listar na vitrine" (só
  gestor, flag na competição-mãe) e o botão "compartilhar" (só gestor).

## Impact

- **Banco de dados**: DUAS colunas aditivas `listada boolean not null default
  false` (`tournaments` + `league_competitions`) + índices parciais opcionais. O
  DDL **é aplicado pelo ORQUESTRADOR via MCP** (o specialist NÃO aplica) — SQL
  exato na seção "Migração" do `design.md`. `default false` = opt-in real:
  nenhuma competição existente entra na vitrine sem o dono optar. O
  `src/lib/supabase/database.types.ts` é atualizado no MESMO PR (adiciona
  `listada` nas Row/Insert/Update das 2 tabelas) para TS/lint/build passarem SEM
  depender do DB.
- **Código de aplicação**: nova página `src/app/dashboard/explorar/page.tsx` +
  loader (`src/features/discovery/data/...`) + card; nova entrada de nav no
  `src/app/dashboard/layout.tsx`; Server Action(s) de toggle (`listada`) em
  `src/actions/`; botão de compartilhar reutilizando o padrão existente; e as
  áreas de gestão das páginas de liga e torneio.
- **RLS**: **nenhuma nova**. Leitura de liga `ativa` / torneio `is_public` já é
  pública ao logado; a escrita de `listada` é na própria linha e já cabe na
  policy de update do dono (mesmo caminho de `is_public`/config).
- **Segurança**: o toggle é gateado por `podeGerir` na action + RLS de dono; a
  vitrine não expõe nada além do que a RLS de leitura já libera; **divisão nunca
  vira card** (toggle escondido na UI + loader exclui divisões por `not exists`).
- **Dependências**: nenhuma. Reutiliza `podeGerir`, o padrão de compartilhar e o
  `ChampionshipBadge`/tema.
