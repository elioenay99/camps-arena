# Proposal — report-swallowed-action-errors

## Why

Várias Server Actions de escrita têm um `catch` externo que **engole** falhas
inesperadas (rede, PostgREST/RPC que lança) atrás de uma mensagem genérica ao
usuário. Como a exceção é tratada, ela nunca escapa — e o `onRequestError`
(`Sentry.captureRequestError`) do `instrumentation.ts` **nunca a vê**. Resultado:
falhas reais e silenciosas, invisíveis no painel mesmo com o Sentry já integrado.
Esses catches são distintos dos `catch (e)` que envolvem os motores puros, cujos
erros são de **domínio/validação esperada** e viram `e.message` ao usuário — esses
NÃO vão (nem devem ir) ao Sentry.

## What Changes

- Captura explícita via `Sentry.captureException(error, { tags: { action } })`
  nos catches que engoliam falha inesperada de escrita, com tag por action para
  filtrar no painel:
  - `createTournament` (`src/actions/tournaments.ts`)
  - `aceitarConviteVaga` e `assumirVagaComoDono` (`src/actions/slots.ts`)
  - `createMatch` (`src/actions/match.ts`)
  - `aceitarConvite` (`src/actions/participants.ts`)
- O texto da mensagem genérica ao usuário e a estrutura de retorno **não mudam**:
  é só observabilidade. O scrub do `sentry.server.config` (PII) continua valendo.
- **Fora de escopo (decisão do usuário)**: `teams.ts:105` (JSON malformado da
  API-Football — erro de borda, não falha interna) e os `catch {}` de `auth.ts`
  (FormData com celular — mais sensíveis; ficam para change própria se desejado).

## Capabilities

Nenhuma capability nova. Modifica o requisito de captura da spec `observability`
para cobrir exceções que seriam engolidas por um catch da action.

## Impact

- **`src/actions/tournaments.ts`, `slots.ts`, `match.ts`, `participants.ts`**:
  cada um ganha `import * as Sentry from "@sentry/nextjs"` e um
  `captureException` no catch correspondente. Cinco catches no total.
- **Comportamento ao usuário**: idêntico (mesma mensagem, mesmo retorno, mesmo
  redirect). Apenas o erro deixa de ser silencioso no Sentry.
- **PII**: nenhum dado novo enviado além do `error` (já coberto pelo scrub); as
  tags são valores estáticos (nome da action). Sem DSN, tudo no-op.
- **Não muda**: os `catch (e)` dos motores puros (validação esperada), DDL,
  segredos, lógica de auth/RLS.
- **Risco**: mínimo. Validação = gates verdes; a captura real só ocorre em deploy
  com DSN (no-op local).
