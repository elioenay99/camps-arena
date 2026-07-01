# Design — add-placar-arbitro-no-torneio

## Contexto

- `OpenMatchesList` (RSC) renderiza as partidas EM ABERTO da aba "Partidas". Recebe
  `mostrarEncerrar` (= `podeArbitrarPartidas` na `page.tsx`) que já liga W.O.+Encerrar para quem
  organiza. Cada item vem de `PartidaAberta` (`getTournamentClassificacao`): `id`, `nome_1/2`,
  `placar_1/2`, `status`, `rodada/perna/grupo`, `escudo_1/2?`, `tecnico_1/2?`, `orfao_1/2?`,
  `vagaId_1/2?`.
- `MatchScoreModalConnected` (client) liga o `MatchScoreModal` a `updateMatchScore` (modo
  `direto`). Props relevantes: `matchId`, `tituloPartida`, `subtitulo`, `descricao`,
  `participante1/2` (`ParticipantePartida`), `placarInicial1/2`, `trigger`, `modoPlacar`,
  `permitirEscolherClube`.
- `updateMatchScore` autoriza: participante do avulso OU quem **arbitra** (dono/admin/árbitro);
  recusa partida `encerrada`; a RLS é a segunda barreira.

## Decisões

1. **Reuso, não novo componente.** O gesto "lançar placar" já é o `MatchScoreModal` em modo
   `direto`. Renderizamos `MatchScoreModalConnected` com `modoPlacar="direto"` e
   `permitirEscolherClube={false}` — **o editor do organizador não edita clube** (não é que "o
   clube venha do torneio": no avulso o clube é cosmético; deliberadamente o editor só mexe no
   placar, e `updateMatchTeams` recusaria o árbitro de todo modo, `match.ts:388`). Passamos
   SEMPRE `placarInicial1={p.placar_1}`/`placarInicial2={p.placar_2}` e
   `tituloPartida="{nome_1} x {nome_2}"` (props obrigatórias/relevantes; `placarInicial` é
   opcional com default 0 — omiti-lo abriria uma partida 2×1 mostrando 0×0 e sobrescreveria ao
   salvar). Sem componente/Action/estado novo — só fiação no RSC.

2. **Gate pela flag que já existe.** O botão só é montado quando `mostrarEncerrar` é true (a
   mesma condição de W.O./Encerrar = quem arbitra). Autorização REAL continua no servidor
   (`updateMatchScore` + RLS); o botão é só UX/descoberta — coerente com o resto da lista.

3. **Montagem dos lados a partir de `PartidaAberta`.** Helper local `ladoModal(nome, escudo,
   tecnico, orfao)` → `ParticipantePartida`:
   - `nome`: `nome_1/2` (clube no competitivo, pessoa no avulso, rótulo no por-nome).
   - `clube`: `{ nome, escudoUrl: escudo }` quando há `escudo`; senão `null` (crest cai no
     fallback de iniciais). Sem `escudo` (avulso/por-nome) não inventa clube.
   - `detalhe`: `téc. <nome>` quando há técnico; `vaga aberta` quando `orfao`; senão indefinido.
   - **Sem** `celular`/`mensagemWhatsApp`/`convocavel` — o modal do organizador não convoca (o
     "Chamar" da linha já cobre isso). Assim nenhum celular cru cruza a fronteira por aqui.

4. **Subtítulo/descrição.** `subtitulo` = rótulo de rodada (reusa o texto já montado no item:
   `G{grupo} R{rodada} ida/volta`, ou vazio no avulso) + `• {status legível}`. `descricao` =
   `{nome_1} enfrenta {nome_2}`. Cosmético; sem PII.

5. **Escopo em aberto.** Só as partidas desta lista (agendada + em_andamento) — exatamente as que
   `updateMatchScore` aceita. Encerrada segue imutável; correção via **Reabrir** (histórico) que
   devolve a partida a "em aberto" e reexibe o editor. Não tocamos `MatchHistoryList`.

6. **Passador intacto.** O item é montado dentro de `renderItem`, que já é reusado tanto na lista
   plana (avulso) quanto no `RoundPager` (competitivo). O botão entra no mesmo container de ações
   (`gap-x-6`) — o passador continua só alternando qual rodada aparece.

## Alternativas descartadas

- **Reaproveitar `getActiveMatches`/`MatchCard` na aba** — traria live score, convocação e o
  filtro por participação (que exclui o dono). Mais peso e o bug de origem. Descartado.
- **Novo mini-dialog de placar** — duplicaria steppers/validação/apresentação do `MatchScoreModal`.
  Descartado por reuso.
- **Editor inline (input na linha)** — quebra o alvo de toque mobile (390px) e a consistência com
  o modal existente. Descartado.

## Riscos

- **Largura da linha no mobile** com um botão a mais (Chamar/Placar/W.O./Encerrar): a linha já é
  `flex-wrap` com `gap`; validar 390px (quebra para segunda linha é aceitável).
- **Placar em partida `agendada`**: lançar placar não muda o status (comportamento atual de
  `updateMatchScore`) — o organizador então "Encerra". Aceito e documentado (fora de escopo mudar).
