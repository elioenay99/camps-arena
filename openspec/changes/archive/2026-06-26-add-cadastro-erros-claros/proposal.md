# Proposal — add-cadastro-erros-claros

## Why

Muitos usuários não conseguem criar conta e veem só o genérico "Não foi possível criar a conta
agora. Tente novamente." (`src/actions/auth.ts`, ramo de erro do `signUp`). Os logs de auth de
produção mostram a causa dominante: **`over_email_send_rate_limit` / HTTP 429** — o limite de
envio de e-mail de confirmação do Supabase (plano free / SMTP compartilhado) estourando em ondas
de cadastro. Nesses casos o usuário **não errou nada**, mas a mensagem sugere que sim e não
orienta o que fazer.

Hoje TODA falha do `signUp` colapsa na mesma mensagem genérica — rate-limit, senha recusada pela
política do Supabase, e-mail malformado: tudo igual. O usuário fica sem saber o que ajustar.

(O fix de raiz do rate-limit é configurar SMTP próprio — decisão do dono, fora do código. Esta
change trata a CAMADA de mensagem: dizer com clareza o que aconteceu.)

## What Changes

- **Mapeamento de erro no `signup`** — novo helper puro `mensagemErroCadastro(error)` em
  `src/actions/auth.ts` traduz a falha do `signUp` do Supabase (por `error.code`/`error.status`)
  em mensagem acionável (pt-BR):
  - `over_email_send_rate_limit` **ou** status `429` → mensagem dedicada e SEM culpa:
    "Estamos com muitos cadastros agora. Aguarde alguns minutos e tente novamente."
  - `weak_password` → erro no campo **senha**: "Senha muito fraca. Escolha uma senha mais
    difícil de adivinhar."
  - `email_address_invalid` → erro no campo **e-mail**: "E-mail inválido."
  - qualquer outro → mantém o genérico atual.
- **Anti-enumeração preservada**: "e-mail já cadastrado" continua caindo no genérico — a action
  NÃO revela se o e-mail já tem conta (mantém a regra do requisito "Cadastro de conta").

## Impact

- **Specs**: `auth` (novo requisito de mensagens de erro acionáveis no cadastro). NÃO toca o
  requisito "Cadastro de conta" (que está sendo modificado em paralelo pela change
  `add-telefone-internacional`) — evita sobreposição de delta.
- **Banco / config**: nenhum. O fix de raiz do rate-limit (SMTP próprio no Supabase) é
  operacional, fora desta change.
- **Código**: `src/actions/auth.ts` (+helper, troca do retorno genérico no ramo de erro do
  `signUp`). Testes: `src/actions/auth.test.ts` (rate-limit, senha fraca, e-mail inválido,
  genérico/anti-enumeração).
- **Compatibilidade**: aditivo. Sucesso e validação Zod (antes do Supabase) inalterados; só o
  ramo de erro do `signUp` ganha granularidade.
- **Fora de escopo**: configurar SMTP/Resend, desligar confirmação de e-mail, revelar
  "e-mail já existe" (mantém anti-enumeração), e mensagens de erro de login/recuperação.
