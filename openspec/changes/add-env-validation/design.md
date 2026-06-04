## Context

Quatro variáveis são lidas pelo runtime do app hoje: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (obrigatórias, com `!`), `NEXT_PUBLIC_SITE_URL` (fallback inline) e `API_FOOTBALL_KEY` (opcional, graciosa). `SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` existem só para uso administrativo/CLI fora do runtime Next (ver `.env.example`) e ficam fora do contrato.

## Goals / Non-Goals

- **Goal**: deploy com env inválida falha no build/boot com mensagem que nomeia as variáveis; acesso a env centralizado e tipado.
- **Non-goal**: validar variáveis que o runtime não lê; introduzir lib externa (t3-env) para 4 variáveis; mudar comportamento da busca de clube.

## Decisions

### 1. Parse eager no load do módulo (não lazy)

`export const env = parseEnv({...})` roda na primeira importação. Pontos de falha, do mais cedo ao mais tardio:

1. **`next build`/`next dev`** — `next.config.ts` importa `./src/lib/env` por side-effect. O Next carrega os `.env*` ANTES de avaliar a config (documentado), então a validação vê os valores reais.
2. **Boot do server/primeira request** — `proxy.ts` → `updateSession` → `env` (toda rota passa pelo proxy).
3. **Client bundle** — `client.ts` → `env`; os valores `NEXT_PUBLIC_*` são inlined em build, então um bundle que buildou com valores válidos valida trivialmente no browser.

Alternativa rejeitada: validar só em `instrumentation.ts#register` — cobre o boot do server, mas não o build, e exige arquivo novo só para isso.

### 2. Referências estáticas a `process.env.NEXT_PUBLIC_*`

O inlining do Next substitui apenas referências **estáticas** (`process.env.NEXT_PUBLIC_X`). O objeto raw passado ao `parseEnv` é montado campo a campo — nunca `z.object().parse(process.env)` nem destructuring dinâmico.

### 3. Campo em branco (`VAR=`) conta como ausente

`.env` com `NEXT_PUBLIC_SUPABASE_URL=` (em branco) carrega `""` — sem normalização, o erro seria "URL inválida" em vez de "ausente". `parseEnv` converte `""` → `undefined` antes do parse. Sem `trim` adicional: valores reais de URL/chave não têm espaço significativo; chave whitespace-only é caso degenerado deliberadamente fora de escopo (env é configuração controlada em build, não input de usuário). URLs são restritas a esquema http(s) — `z.url()` sem params aceitaria `javascript:`/`ftp:`.

### 4. `API_FOOTBALL_KEY`: accessor em runtime, fora do parse eager

Três motivos:
- **Degradação graciosa é contrato** (spec `team-search`): sem a chave, a busca responde "indisponível" — não pode derrubar o app inteiro no boot.
- **Server-only**: não entra no objeto inlined; a leitura acontece por chamada, dentro da Server Action.
- **Testabilidade**: `teams.test.ts` usa `vi.stubEnv("API_FOOTBALL_KEY", ...)` por teste; leitura em runtime preserva os stubs.

`apiFootballKey()` normaliza `""` → `undefined` (mesma semântica do item 3).

### 5. Dummies em `vitest.config.ts#test.env`

O parse eager roda em qualquer teste que importe transitivamente `env.ts` (ex.: `teams.test.ts` → `actions/teams` → `env`). Dummies das duas públicas obrigatórias mantêm a suíte determinística sem `.env.test` (que o Next carregaria, mas o vitest não — vitest não passa pelo loader de env do Next).

### 6. Mensagem de erro custom em pt-BR

`issues.map(i => caminho: mensagem)` em vez de `z.prettifyError` — formato estável, em pt-BR, uma linha por variável.

## Risks / Trade-offs

- **`next.config.ts` importando módulo de `src/`**: suportado (config TS compila imports relativos desde o Next 15); acopla config ao app, mas é 1 linha e o ganho (falha no início do build) compensa.
- **`env` congelado no load**: se algum dia uma variável pública precisar variar em runtime, terá que sair do objeto eager (mesmo padrão do `apiFootballKey()`).
- **Browser valida de novo o que o build já validou**: custo desprezível (4 campos) e protege contra builds com inlining parcial/estranho.
