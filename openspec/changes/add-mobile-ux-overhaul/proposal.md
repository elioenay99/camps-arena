## Why

O Goliseu é usado majoritariamente no celular (PWA instalável), mas várias telas
quebram em 390px de largura. O dono reportou (5 screenshots do detalhe do
torneio): a barra de abas rola horizontalmente e corta "Rodadas"/"Vagas"; a
classificação obriga a rolar pro lado e o nome do time fica cortado, sem um modo
que caiba tudo; os botões de ação das partidas (W.O./Editar placar/Encerrar/
Chamar) vazam do card; e na aba Vagas a URL de convite e os botões (Desistir/
Expulsar) vazam pra fora da tela. Pediu também que se varresse o app inteiro
atrás de problemas da mesma classe.

Duas auditorias por workflow confirmaram o diagnóstico: (1) mapeamento das 4
telas reclamadas; (2) varredura ampla de 8 áreas do app. O app está **saudável no
geral** — 0 crítico de dados/segurança; a maioria dos containers largos já isola
o próprio scroll e os nomes já usam `min-w-0`/`truncate`. Os achados reais são
polimento **mobile-first** e colapsam em poucos grupos com **fix compartilhado**:

- **Overflow horizontal REAL da viewport** em pontos específicos: clusters de
  botão que não empilham (`shrink-0`/`gap` largo), a barra de abas que rola, e
  texto controlado pelo usuário (nome de time/torneio/divisão, URL) sem
  quebra em cards estreitos.
- **Bloqueador sistêmico de modais**: o `DialogContent` base não tem
  `max-height` nem scroll — modal alto (pior caso: lançar placar com o teclado
  aberto) corta header/rodapé e deixa os botões inalcançáveis.
- **Alvos de toque < 44px** com raiz em dois primitivos (`Input` e `Button`
  `h-8`) herdados por todos os forms e CTAs.
- **Bracket** (mata-mata) rolando "às cegas" no celular, sem pistas de que há
  mais fases à direita.

## What Changes

Tudo é **apresentação/layout** — nenhuma mudança de banco, Server Action, tipo de
dados ou regra de autorização/perfil.

- **Abas do torneio**: a barra passa a caber sem rolagem no mobile — segmented de
  colunas iguais (`grid auto-cols-fr`) com ícone + rótulo curto, e texto por
  extenso no desktop. O nome acessível completo é preservado (`sr-only`).
- **Classificação com dois modos**: um toggle "Rolar pro lado" (todas as stats,
  scroll horizontal — comportamento atual) ↔ "Caber tudo" (compacto, cabe na
  largura da tela mantendo as 8 stats). Padrão no celular = "Caber tudo"; a
  escolha é lembrada (localStorage). Um clique reconfigura grupos + geral + clubes.
  O toggle é estendido também às classificações de **copas** (grupos) e **ligas**
  (divisões), que sofrem o mesmo aperto no mobile.
- **Clusters de botão que estouram** (partidas e vagas) passam a empilhar
  full-width no mobile e voltar inline no desktop, via um **padrão único** aplicado
  no container (sem editar as folhas client).
- **URL de convite** e a **semente de auditoria** deixam de ser cortadas
  (`truncate` → `break-all`): quebram em linhas e ficam legíveis/copiáveis.
- **Dialog primitivo** ganha scroll vertical com header/rodapé/fechar fixos
  (`max-h-[calc(100dvh-2rem)]` + grid-rows) — conserta todos os modais de uma vez.
- **Alvos de toque ≥ 44px no mobile** na fonte: `Input` e `Button` (size default)
  passam a `h-11 md:h-8` (desktop compacto intacto), com ajustes downstream (nav,
  avatar, seletor de país, cluster do avatar, fechar do dialog).
- **Nav do dashboard** colapsa num **menu hambúrguer** no mobile (inline no
  desktop) — cabeçalho limpo e escalável.
- **Bracket mobile (Camada 1, CSS-only)**: scroll-snap por fase, gradientes de
  borda como affordance e cards mais estreitos no mobile — mantendo o `BracketView`
  como RSC.
- **break-words** em texto do usuário nos pontos que ainda vazam (campeão do
  bracket, herói/subtítulo do convite, cabeçalho do `DivisaoCard`, resumo do
  wizard).
- **Rede de segurança global**: `overflow-x: clip` no `body` (não substitui os
  consertos por-elemento).

Fora de escopo (follow-up): seletor de fase client do bracket (Camada 2) e a
reestruturação da `MatchHistoryList` (legibilidade, não é overflow).

## Capabilities

### Modified Capabilities
- `design-system`: primitivos ganham garantias mobile (alvo de toque ≥ 44px no
  mobile, `Dialog` rolável, padrão de cluster de botão que empilha).
- `standings-page`: a classificação passa a oferecer dois modos de visualização
  (rolar/caber) com preferência persistida.
- `app-shell`: a navegação do dashboard colapsa em menu no mobile; guarda global
  de overflow horizontal.
- `tournament-management`: a barra de seções e os clusters de ação (partidas/
  vagas) deixam de estourar a viewport no mobile.
- `knockout-format`: o bracket ganha UX de rolagem usável no mobile (snap +
  affordance) sem virar client.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **Código de aplicação** (~14 arquivos + os 4 já mapeados; todos de UI):
  - Primitivos: `src/components/ui/{tabs,dialog,input,button}.tsx`,
    `src/app/globals.css`.
  - Torneio: `src/features/tournament/components/{TournamentTabs,VagasSection}.tsx`,
    `src/features/match/components/{OpenMatchesList,MatchScoreModal}.tsx`,
    `src/app/dashboard/torneios/[id]/page.tsx`.
  - Classificação: NOVO `src/features/standings/components/ClassificacaoResponsiva.tsx`
    (client fino) + `StandingsTable.tsx` (reage a `data-modo`) + os call-sites de
    copas (`src/app/dashboard/copas/edicao/[id]/page.tsx`) e ligas
    (`src/app/dashboard/ligas/[id]/page.tsx`).
  - Dialog: `ui/dialog.tsx` ganha `DialogBody` (slot rolável); `MatchScoreModal` e
    `PhoneField` envolvem o miolo nele.
  - Nav/shell: `src/features/nav/components/NavLinks.tsx`,
    `src/app/dashboard/layout.tsx`.
  - Bracket/texto livre: `src/features/knockout/components/BracketView.tsx`,
    `src/app/convite/[codigo]/{convite-ui.tsx,page.tsx}`,
    `src/app/dashboard/ligas/[id]/page.tsx`,
    `src/features/league/components/{LeagueWizard,FluxoTemporadaPanel}.tsx`,
    `src/features/profile/components/AvatarUpload.tsx`,
    `src/features/auth/components/PhoneField.tsx`.
- **Banco de dados**: **nenhum**. Sem DDL, sem migration.
- **Dependências**: nenhuma nova.
- **Segurança/autorização**: **inalterada**. Nenhum gate, action, condição de
  perfil (dono/técnico/moderador) ou RLS é tocado — 100% classes/layout. O padrão
  de cluster usa seletor de descendente que NÃO alcança conteúdo de modal
  (portalado), então botões de modais ficam intactos.
- **Testes**: quase todos seguem verdes (nomes acessíveis preservados via
  `sr-only`; `break-all`/classes não mudam `textContent`). UMA edição necessária:
  `torneios/[id]/page.test.tsx:498-499` passa a assertar as abas por accessible
  name (o rótulo agora tem span curto + completo, então `textContent` concatena).
  Novos testes: `ClassificacaoResponsiva` (toggle), smoke das classes de modo na
  `StandingsTable`, e `NavLinks` (disclosure). O toggle guarda `window.matchMedia`
  (ausente no jsdom). Gate completo (typecheck/lint/test/build) + validação visual
  ao vivo em 390px/360px.
