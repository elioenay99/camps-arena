# Tasks — report-swallowed-action-errors

## 1. Captura nos catches que engoliam falha inesperada

- [x] 1.1 `src/actions/tournaments.ts`: `createTournament` — `catch (error)` +
      `Sentry.captureException(error, { tags: { action: "createTournament" } })`.
- [x] 1.2 `src/actions/slots.ts`: `aceitarConviteVaga` e `assumirVagaComoDono`
      (dois catches) — idem, tag por action.
- [x] 1.3 `src/actions/match.ts`: `createMatch` — idem.
- [x] 1.4 `src/actions/participants.ts`: `aceitarConvite` — idem.
- [x] 1.5 Import `import * as Sentry from "@sentry/nextjs"` nos quatro arquivos.

## 2. Validação

- [x] 2.1 Gates locais: typecheck/lint/test verdes (840 testes ✅). Mensagens ao
      usuário e retornos inalterados.
- [x] 2.2 Commit + push + CI verde + archive. Sem pendência manual. Captura real
      só em deploy com DSN (no-op local). Run `27243273327` verde.
