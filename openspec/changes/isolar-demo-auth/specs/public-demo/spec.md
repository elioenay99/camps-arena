## ADDED Requirements

### Requirement: Middleware não renova sessão nem chama Supabase em `/demo`

O proxy (`src/proxy.ts`) SHALL aplicar `x-nonce` no request interno e
`Content-Security-Policy` na resposta para `/demo` e `/demo/*` exatamente como para
qualquer outra rota, MAS NÃO SHALL executar o refresh de sessão (`updateSession` →
`supabase.auth.getUser()`) nessas rotas — um visitante da demo não tem sessão a renovar e
`/demo` não é rota protegida. A detecção da demo SHALL usar limite de segmento
(`pathname === "/demo"` ou `pathname` iniciando com `"/demo/"`), de modo que rotas que
apenas compartilham o prefixo (ex.: `/demonstration`, `/demo-extra`) NÃO recebam o bypass.
O matcher do proxy e `PROTECTED_PREFIXES` SHALL permanecer inalterados: `/demo` continua
passando pelo proxy para receber nonce/CSP, e as rotas protegidas seguem redirecionando o
visitante não autenticado.

#### Scenario: Demo não dispara chamada ao Supabase

- **WHEN** um visitante sem sessão navega para `/demo` (ou `/demo/torneios`, `/demo/ligas`)
- **THEN** o proxy responde sem chamar `updateSession`/`supabase.auth.getUser()` e a
  resposta ainda inclui `content-security-policy` (e o request interno recebe `x-nonce`)

#### Scenario: Rotas protegidas seguem renovando sessão

- **WHEN** uma requisição chega em `/dashboard` ou `/atualizar-senha`
- **THEN** o proxy chama `updateSession`, renovando a sessão e redirecionando o visitante
  não autenticado para `/login` como antes

#### Scenario: Prefixo compartilhado não recebe o bypass

- **WHEN** uma requisição chega em `/demonstration` ou `/demo-extra`
- **THEN** o proxy trata a rota como normal e chama `updateSession` (o bypass é exclusivo
  de `/demo` e `/demo/*`)
