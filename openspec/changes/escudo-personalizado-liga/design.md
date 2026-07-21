# Design — Escudo personalizado por liga

## 1. Onde o override mora, e por que não é tabela nova

`public.league_competitors` já É a entidade "este clube, DENTRO desta pirâmide":
`(competition_id, team_id)` é único por índice parcial
(`league_competitors_team_unico`), e a linha já carrega identidade local — `rotulo` (nome
customizado) e `holder_user_id` (técnico). Um escudo customizado é mais um atributo de
identidade local do MESMO par. Uma tabela `league_team_overrides(competition_id, team_id,
escudo_url)` reproduziria a chave que já existe e criaria um segundo lugar onde a
identidade de um competidor pode divergir.

Consequência boa e não óbvia: como a coluna fica no competidor e **não** no par
`(liga, clube)`, o override também funciona para competidor **por NOME**
(`rotulo` sem `team_id`), que hoje só tem monograma de iniciais. Não custa nada — o
`coalesce` já degrada — e é um ganho direto de produto. Nenhuma CHECK amarra
`escudo_url` a `team_id`.

## 2. A decisão de arquitetura: um hop, não uma view

O briefing levantou o risco certo: "resolver o `coalesce` em 12 lugares à mão vira
dívida". A investigação mudou o quadro. O ponto-chave:

> `tournament_slots.competitor_id` (`schema.sql:2154`) e `cup_entries.competitor_id`
> (`schema.sql:4100`) já apontam para `league_competitors`.

Toda vaga competitiva de liga já tem **um ponteiro direto** para a linha onde o override
vive. Não existe o problema de "os fetchers partem de `tournament_slots`, não de
`league_competitors`" — eles partem de `tournament_slots`, que aponta para
`league_competitors`. Ninguém precisa derivar `competition_id` percorrendo
`league_division_seasons → league_seasons → league_competitions`.

### Opções avaliadas

**(a) View SQL `clube_efetivo(competition_id, team_id, nome, escudo_url)` — REJEITADA.**
- PostgREST só embeda relação com **FK inferível**. A view seria chaveada em
  `(competition_id, team_id)` — composta e sem FK — então `tournament_slots` não
  conseguiria embedá-la. Todos os 14 fetchers teriam de virar RPC ou ganhar uma segunda
  query manual e um `join` em memória: MAIS código, não menos.
- Os fetchers passariam a depender de uma superfície SQL nova sujeita à auditoria de
  `search_path` que o projeto já pagou nas 22 funções DEFINER.
- Uma view `security_invoker` sobre `league_competitors` + `teams` herdaria as duas RLS e
  mudaria o plano de queries que hoje são planas.

**(b) Função SQL `escudo_efetivo(p_competitor uuid, p_team uuid)` — REJEITADA.**
Resolve por linha, então vira N chamadas por render (a classificação de uma divisão de 20
clubes faria 20 chamadas), e continua não sendo embedável — cada fetcher precisaria de uma
ida extra ao banco. Troca dívida de repetição por dívida de latência.

**(c) Embed de um hop + helper puro — ESCOLHIDA.**
Cada fetcher acrescenta ao `select` que já faz:

```
competidor:league_competitors!tournament_slots_competitor_id_fkey ( escudo_url )
```

e aplica um único helper:

```ts
export function escudoEfetivo(custom, doCatalogo) { return custom ?? doCatalogo ?? null }
```

Por que isto NÃO é a dívida que o briefing temia:
- **Custo zero de round-trip.** É embed aninhado no `select` existente; nenhuma query nova.
- **A regra mora em UM lugar.** O que se repete é o `select`, não a decisão. Se a regra
  mudar (ex.: override por temporada), muda-se `escudoEfetivo` e os call sites seguem.
- **Degrada sozinho.** `competitor_id` é `null` em torneio avulso e em todo torneio legado
  → o embed vem `null` → `coalesce` devolve o escudo do catálogo. Comportamento de hoje,
  sem `if`.
- **É verificável por grep.** `escudo_url` no `select` sem `escudoEfetivo` no arquivo é um
  erro detectável mecanicamente — o que uma view escondida atrás de PostgREST não seria.

O que a opção (c) NÃO resolve e é aceito conscientemente: `src/lib/supabase/database.types.ts`
é mantido à mão, então cada fetcher já faz `as unknown as {...}` na fronteira do embed —
adicionar o campo exige atualizar a interface local em cada arquivo. Isso é dívida
pré-existente do projeto, não introduzida aqui.

### Duas superfícies fora do padrão

- **`getEdicao` (copa)** não usa embed: faz `from("teams").in("id", teamIds)` a partir de
  `cup_entries`. Ganha o embed em `cup_entries` (que tem `competitor_id`), não em `teams`.
- **`info_convite_vaga`** é RPC SQL — o `coalesce` entra no corpo, via `left join
  league_competitors lc on lc.id = ts.competitor_id`. A **assinatura (`returns table`) não
  muda**, então `create or replace` basta e não recai no `42P13` que já custou uma sessão
  (lição de `add-copa-tecnico`: mudar `returns table` exige `DROP` + `CREATE` + re-emitir
  grants). Os grants são re-emitidos mesmo assim, por higiene.

## 3. Copa: o override vale

`cup_entries.competitor_id` existe justamente porque a copa por-clube **herda o competidor
da divisão** (change `add-copa-tecnico-heranca`). É o mesmo clube, do mesmo dono, dentro
da mesma pirâmide — se o dono trocou o escudo do time dele na liga, ver o escudo antigo na
copa da mesma liga seria um bug de percepção. Entrada de copa manual ou por-nome tem
`competitor_id` null e segue no catálogo.

## 4. Segurança

**Autorização — nenhuma policy nova em `league_competitors`.** A policy de UPDATE
(`league_competitors_update_owner`, `schema.sql:3805`) já usa
`public.pode_gerir_competition`, que resolve `created_by` **OU** `league_members.papel =
'admin'` (`schema.sql:3159`). A decisão do dono (dono + admins) já está implementada. A
action faz o pré-check com `podeGerir` e a RLS é o backstop — segurança em profundidade,
como o resto do projeto.

**CHECK anti-SSRF com host ANCORADO.** A lição de `add-escudos-self-host` (LIKE sem âncora
de host = SSRF) é espelhada literalmente: `%` só no meio (sub-referência do projeto) e no
fim (path), nunca na frente do host — senão
`http://169.254.169.254/x/storage/v1/object/public/escudos/y.png` passaria e abriria SSRF
no sink de `escudoDataURL` (`og/compartilhado.tsx`). O ramo `media.api-sports.io` NÃO
entra: escudo customizado sempre nasce no nosso Storage.

**Storage: por que uma função, e não a policy inline.** O path é
`custom/<competitor_id>/<uuid>.<ext>` e a autorização exige ler `competition_id` a partir
do `competitor_id` embutido no path. Fazer isso inline exigiria `((storage.foldername(name))[2])::uuid`
dentro de um `and` — e o planejador do Postgres **não garante a ordem de avaliação** dos
ramos de um `and`, então um `name` arbitrário poderia atingir o cast antes do regex e
levantar `22P02` em vez de devolver `false`. `public.pode_gerir_escudo_custom(text)` é
`plpgsql` (avaliação sequencial garantida): valida o regex, só então converte, e devolve
`false` para qualquer coisa que não case. É `SECURITY DEFINER` porque precisa ler
`league_competitors.competition_id` sem reentrar na RLS, e só devolve um booleano já
filtrado por `pode_gerir_competition` — não vaza dado. `search_path = ''` e schema
qualificado, como as outras 22.

Grants: `revoke ... from public` + `grant ... to authenticated`. **Não** se revoga o
EXECUTE dos roles que a policy usa — a lição de `arena-seguranca-supabase` (revogar
EXECUTE dos helpers de RLS quebrou `matches`) vale aqui: a policy de Storage é avaliada
com o role da query.

A policy de INSERT existente (`"escudos insert autenticado"`, `name ~ '^[0-9]+\.png$'`)
**não muda**. Policies permissivas se somam por `OR`: o catálogo continua ancorado em
`<external_id>.png` e continua sem UPDATE/DELETE (imutável). A policy de DELETE nova casa
**só** o prefixo `custom/`, então nenhum escudo do catálogo global fica apagável por
usuário autenticado.

**Validação do arquivo.** Reusa `sniffTipoImagem` de `src/lib/evidence.ts` (magic bytes
PNG/JPEG/WEBP) com cross-check contra o MIME declarado — o cliente não é a fonte da
verdade do `contentType` no upload. O allowlist do servidor é `png|webp`, espelhando
`allowed_mime_types` do bucket; SVG fica fora (SVG-XSS armazenado servido pelo nosso
host). `removerExifJpeg` **não** é chamado porque JPEG não é aceito — e o EXIF já morre
antes, no canvas do cliente.

**Por que reduzir no cliente.** O bucket tem `file_size_limit` de 256KB; uma foto de
celular tem 2-5MB. Sem redução, a feature simplesmente não funcionaria pelo celular — que
é o caso de uso do dono. O canvas 256×256 resolve tamanho, formato e EXIF de uma vez. Não
é controle de segurança (cliente é burlável): o servidor revalida bytes e tamanho, e o
bucket é o terceiro anteparo.

## 5. Ciclo de vida do arquivo

Path `custom/<competitor_id>/<uuid>.<ext>` — nome novo a cada gravação, nunca `upsert`.
Motivo: o bucket serve com `cache-control` de 1 ano; reusar o nome deixaria o escudo
antigo cacheado no CDN e nos aparelhos. Nome novo é cache-busting por construção.

O arquivo anterior é apagado **best-effort depois** do UPDATE bem-sucedido: se o DELETE do
Storage falhar, sobra um órfão de ≤256KB — barato — e o banco continua correto. A ordem
inversa (apagar antes) arriscaria escudo quebrado se o UPDATE falhasse. Se o UPDATE for
barrado pela RLS, o arquivo recém-subido é removido para não deixar lixo.

## 6. Fora de escopo (explícito)

- `src/features/demo/*` — a subárvore pública é 100% fixtures em memória, sem banco, e é
  guardada por lint escopado + teste de grafo type-aware. Não toca.
- Migrar `atualizarAvatar` (`src/actions/profile.ts`) para `evidence.ts` — ele valida só o
  MIME declarado, sem magic bytes nem strip de EXIF. É uma lacuna real, mas de outra
  change.
- Override de **nome** do clube por liga — `rotulo` já existe e resolve, e ninguém pediu.
