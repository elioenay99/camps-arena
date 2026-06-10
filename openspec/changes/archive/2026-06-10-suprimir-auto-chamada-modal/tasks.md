# Tasks — suprimir-auto-chamada-modal

## 1. Gate de convocável no modal

- [x] 1.1 `MatchScoreModal.tsx`: campo `convocavel?: boolean` em
      `ParticipantePartida`; o link/botão "Chamar …" só quando `convocavel` E
      celular válido.
- [x] 1.2 `MatchCard.tsx`: setar `p1.convocavel`/`p2.convocavel` a partir do
      `adversario` (só o adversário; espectador → nenhum).

## 2. Testes

- [x] 2.1 `MatchScoreModal.test.tsx`: caso "sem auto-chamada" (lado não
      convocável com celular → sem botão; adversário → com botão); marca
      `convocavel` nos casos existentes.
- [x] 2.2 `MatchCard.test.tsx`: guard capturando props do modal — próprio
      usuário `convocavel:false`, adversário `true`; espectador → ambos `false`.

## 3. Validação

- [x] 3.1 Gates locais: typecheck/lint/test (843 ✅) + build de produção.
- [x] 3.2 Commit + push + CI verde + archive. Sem pendência manual. Run
      `27244220581` verde.
