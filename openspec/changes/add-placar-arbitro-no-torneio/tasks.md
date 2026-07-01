# Tasks — add-placar-arbitro-no-torneio

## 1. Editor de placar do organizador na aba Partidas
- [x] 1.1 `OpenMatchesList`: helper local `ladoModal(nome, escudo, tecnico, orfao)` →
      `ParticipantePartida` (nome; clube só quando há escudo; detalhe téc./vaga aberta; SEM
      celular/convocável)
- [x] 1.2 `OpenMatchesList.renderItem`: quando `mostrarEncerrar`, montar
      `MatchScoreModalConnected` (`modoPlacar="direto"`, `permitirEscolherClube={false}`) com
      gatilho "Editar placar" no container de ações, antes de "Encerrar". Passar SEMPRE
      `placarInicial1={p.placar_1}`/`placarInicial2={p.placar_2}` e
      `tituloPartida="{nome_1} x {nome_2}"` (placarInicial é opcional/default 0 — omiti-lo
      sobrescreve o placar existente ao salvar); subtítulo = rótulo de rodada + status; descrição
      = "{nome_1} enfrenta {nome_2}"
- [x] 1.3 Garantir que jogador/visitante (`mostrarEncerrar` false) NÃO veem o gatilho; avulso e o
      passador por rodada seguem intactos (o botão entra no mesmo `renderItem`)

## 2. Testes
- [x] 2.1 `OpenMatchesList`: com `mostrarEncerrar` true, cada partida em aberto expõe o gatilho de
      lançar placar (competitivo e avulso); com false, não expõe. **MOCKAR**
      `MatchScoreModalConnected` (padrão de `MatchCard.test.tsx`) para assertir presença/ausência
      por papel de forma hermética e capturar os props passados (sem carregar transitivamente
      `actions/scoreProposals`/`actions/teams`)
- [x] 2.2 Regressão: Chamar/Solicitar W.O./W.O./Encerrar e o passador continuam como antes; avulso
      plano preservado; guard anti-`use client` do arquivo permanece válido
- [x] 2.3 Anti-PII: os props capturados do `MatchScoreModalConnected` (mock) NÃO contêm
      `celular`/telefone; o HTML do gatilho não expõe `wa.me`/`tel:` nem botão "Chamar" interno

## 3. Gates de qualidade (automáticos)
- [x] 3.1 `pnpm typecheck` verde
- [x] 3.2 `pnpm lint` verde
- [x] 3.3 `pnpm test` verde (suíte completa — 1307)
- [x] 3.4 `pnpm build` verde
- [x] 3.5 Revisão adversarial do diff por workflow (0 must_fix; should_fix/nits corrigidos)
