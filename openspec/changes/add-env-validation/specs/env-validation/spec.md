## ADDED Requirements

### Requirement: Validação fail-fast das variáveis de ambiente de runtime
O sistema SHALL validar, com Zod e no carregamento de um módulo central (`src/lib/env.ts`), as variáveis de ambiente exigidas pelo runtime do app: `NEXT_PUBLIC_SUPABASE_URL` SHALL ser uma URL com esquema http(s); `NEXT_PUBLIC_SUPABASE_ANON_KEY` SHALL ser uma string não vazia. Valores em branco — string vazia; whitespace-only fica fora de escopo por decisão deliberada — SHALL ser tratados como ausentes. Em caso de falha, o erro SHALL nomear cada variável ausente ou inválida em uma mensagem em pt-BR, e o app NÃO SHALL atender requisições.

#### Scenario: Variável obrigatória ausente derruba o boot com mensagem clara
- **WHEN** o app inicia (build, dev ou server) sem `NEXT_PUBLIC_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **THEN** a inicialização falha com um erro que nomeia TODAS as variáveis faltantes, antes de atender qualquer requisição

#### Scenario: Variável em branco conta como ausente
- **WHEN** uma variável obrigatória está definida como string vazia (ex.: `NEXT_PUBLIC_SUPABASE_URL=`)
- **THEN** a validação a trata como ausente e falha nomeando a variável

#### Scenario: Valor malformado é rejeitado
- **WHEN** `NEXT_PUBLIC_SUPABASE_URL` contém um valor que não é URL válida
- **THEN** a validação falha nomeando a variável e o motivo

#### Scenario: Build falha cedo
- **WHEN** `next build` (ou `next dev`) roda com env inválida
- **THEN** a falha ocorre no carregamento da configuração (side-effect import em `next.config.ts`), não no meio do prerender nem na primeira requisição

### Requirement: Acesso centralizado e tipado às variáveis de ambiente
Os consumidores de runtime SHALL ler variáveis de ambiente exclusivamente pelo módulo central tipado — nenhum `process.env.X` SHALL permanecer em `src/` fora de `src/lib/env.ts`. As referências a variáveis `NEXT_PUBLIC_*` no módulo SHALL ser estáticas (campo a campo), preservando o inlining do Next em client bundles. `NEXT_PUBLIC_SITE_URL` SHALL ter default `http://localhost:3000` quando ausente.

#### Scenario: Clientes Supabase usam o módulo central
- **WHEN** qualquer cliente Supabase (browser, server, middleware) é criado
- **THEN** URL e chave anônima vêm do módulo central validado, sem non-null assertion

#### Scenario: Default da URL canônica
- **WHEN** `NEXT_PUBLIC_SITE_URL` está ausente em desenvolvimento local
- **THEN** o app usa `http://localhost:3000` como base de metadados, sem erro

### Requirement: Segredo opcional server-only lido em runtime
`API_FOOTBALL_KEY` SHALL permanecer opcional e SHALL ser lida em runtime, a cada chamada, por um accessor do módulo central — fora do parse eager — preservando a degradação graciosa da busca de clube (capability `team-search`) e impedindo que a ausência da chave derrube o app. Valor em branco SHALL contar como ausente.

#### Scenario: Chave ausente não derruba o app
- **WHEN** o app inicia sem `API_FOOTBALL_KEY`
- **THEN** o boot conclui normalmente e apenas a busca de clube responde com erro amigável de indisponibilidade

#### Scenario: Chave em branco equivale a ausente
- **WHEN** `API_FOOTBALL_KEY` está definida como string vazia
- **THEN** o accessor retorna ausência e a busca degrada graciosamente, sem chamada à API externa
