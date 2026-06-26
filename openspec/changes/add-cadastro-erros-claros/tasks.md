# Tasks — add-cadastro-erros-claros

## 1. Mapeamento de erro
- [x] 1.1 `src/actions/auth.ts`: helper puro `mensagemErroCadastro(error)` (rate-limit/429,
      weak_password, email_address_invalid, fallback genérico) e usá-lo no ramo de erro do `signUp`

## 2. Testes
- [x] 2.1 `src/actions/auth.test.ts`: estender o mock para passar `code`/`status` no erro do signUp
- [x] 2.2 Casos: rate-limit → mensagem "muitos cadastros" sem fieldErrors; weak_password → erro no
      campo senha; email_address_invalid → erro no campo e-mail; código desconhecido → genérico

## 3. Specs
- [x] 3.1 Delta `auth`: novo requisito "Mensagens de erro acionáveis no cadastro"

## 4. Gates
- [x] 4.1 `pnpm typecheck` verde
- [x] 4.2 `pnpm lint` verde
- [x] 4.3 `pnpm test` verde (suíte completa)
- [x] 4.4 `pnpm build` verde
