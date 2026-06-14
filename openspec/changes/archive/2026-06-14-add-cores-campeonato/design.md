# Design — add-cores-campeonato

> Revisado após gate adversarial (workflow `wu73vrxnh`): correções de 6 must-fix +
> should-fix incorporadas (liga por-divisão, fetchers explícitos, copy N+1 nas 2 pontas,
> zonas, idempotência do CHECK, wrapper sem `<div>` extra, ColorField não-RHF + a11y).

## 1. Modelo de dados (DDL idempotente, local-first)

DDL aditiva, desenvolvida no **Supabase local** (`psql`), promovida a prod via MCP
(mostrando o SQL), espelhada em `supabase/schema.sql`. Como `ALTER TABLE … ADD CONSTRAINT`
NÃO aceita `IF NOT EXISTS`, cada CHECK é precedido de `drop constraint if exists` (padrão
do repo — ver `schema.sql:101-103`). Para cada tabela em
`{tournaments, league_competitions, league_division_seasons}`:

```sql
alter table public.<t> add column if not exists cor_primaria  text;
alter table public.<t> add column if not exists cor_secundaria text;
alter table public.<t> drop constraint if exists <t>_cor_primaria_hex;
alter table public.<t> add  constraint <t>_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.<t> drop constraint if exists <t>_cor_secundaria_hex;
alter table public.<t> add  constraint <t>_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');
```

CHECK em minúsculo; a validação Zod normaliza para minúsculo antes de gravar (§4).

**Herança (resolvida no app, na leitura):**
- Torneio avulso/normal: `tournaments.cor_* ?? PADRÃO_APP`.
- Divisão de liga: `division_seasons.cor_* ?? competition.cor_* ?? PADRÃO_APP`.
- **Torneio QUE É uma divisão** (criado pela RPC `montar_temporada`, nunca recebe cor):
  ver §5 (fallback por `league_division_seasons`).

`PADRÃO_APP` = **não tematiza** ⇒ tema base do app. Campeonatos existentes (cores null)
ficam idênticos.

**Persistência multi-temporada:** cores da divisão vivem em `league_division_seasons`;
`montarProximaTemporada` copia nas **duas pontas** (§4). Cor da pirâmide em
`league_competitions`. Cor de torneio em `tournaments`.

**RLS/grants:** colunas de exibição. Leitura coberta pelas SELECT policies existentes;
escrita só pelo dono (UPDATE policies por-linha + checagem de posse na action). **Sem
policy nova.** Conferir que nenhum trigger de LOCK (`lock_slot_relations`,
`lock_league_division_season`, etc.) congela estas colunas — elas NÃO entram nos campos
travados (são metadados de exibição); validar na implementação lendo cada trigger.

## 2. Tematização SSR-safe

### 2.1 Aplicação sem `<div>` extra (preserva a cadeia flex)
Inserir um `<div>` entre o container flex do `dashboard/layout.tsx` e a `<main>`
(`flex-1 flex-col`) quebraria o stretch. Então NÃO há wrapper que envolve; expõe-se um
helper que devolve props para **espalhar no elemento que já existe**:

```ts
// src/features/championship/championshipTheme.ts
export function champThemeProps(primary?: string|null, secondary?: string|null) {
  if (!primary && !secondary) return null;            // sem cor ⇒ tema base
  return {
    className: 'champ-theme',
    style: {
      ...(primary   && { '--brand-primary':   primary }),
      ...(secondary && { '--brand-secondary': secondary }),
      // fallback determinístico p/ navegador sem relative-color (override no @supports):
      ...(primary && { '--primary-foreground': onColor(primary) }), // luminância da cor crua
    } as CSSProperties,
  };
}
```
- **Torneio:** `const t = champThemeProps(...)` e espalhar em `<main {...t}>` (mantém as
  classes de layout existentes via `className={cn('…flex-1 flex-col', t?.className)}`).
- **Liga:** aplicar em **cada `DivisaoCard`** (a cor JÁ resolvida da divisão), não na
  `<main>`. Aninhar `.champ-theme` dentro de outro `.champ-theme` é OK: cada card
  redefine `--brand-primary` a partir do próprio inline e re-deriva localmente.

### 2.2 Derivação por tema (globals.css)
```css
/* fallback (sem relative-color): cor crua; --primary-foreground vem inline do helper */
.champ-theme { --primary: var(--brand-primary); --ring: var(--brand-primary); }

@supports (color: oklch(from white l c h)) {
  .champ-theme {                          /* tema CLARO (base :root) */
    --primary: oklch(from var(--brand-primary) 0.49 c h);
    --primary-foreground: #ffffff;
    --ring: oklch(from var(--brand-primary) 0.49 c h);
  }
  .dark .champ-theme {                     /* tema ESCURO */
    --primary: oklch(from var(--brand-primary) 0.74 c h);
    --primary-foreground: #1c1d26;
    --ring: oklch(from var(--brand-primary) 0.74 c h);
  }
}
```
Sobrescreve **só** `--primary`/`--primary-foreground`/`--ring` (a marca pervasiva). NÃO
remapeia `--accent` (blast radius). A **secundária** é usada **crua** e deliberadamente
no `ChampionshipIdentity` (gradiente do escudo, que controla seu próprio contraste) —
sem token `--brand-secondary-norm` global no v1 (YAGNI: único consumidor é a identidade,
que usa a crua). Valores de L afinados na implementação para AA; validação ao vivo.
A promessa de **AA** vale para o caminho com relative-color; o fallback é "funcional".

## 3. Componentes de UI
- `ChampionshipIdentity` (`src/features/championship/components/`): escudo com gradiente
  `--brand-primary`→`--brand-secondary` (cruas; texto/contraste controlados pelo componente)
  + título. Vai (a) no header do torneio (`torneios/[id]:210-243`, troca o ícone
  `bg-primary/10`) e (b) em **cada `DivisaoCard`** da liga. O **header da pirâmide**
  (`ligas/[id]:153-176`, ícone `Layers`) NÃO recebe escudo de divisão — fica neutro, ou
  usa a cor **da competição** se definida.
- `ColorField` (`src/components/ui/color-field.tsx`): **controlado** por `value`/`onChange`
  (+ `name` opcional p/ FormData) — os formulários do app são nativos (FormData) e estado
  local, **não** react-hook-form. Composto por `<input type="color">` + campo **hex
  textual** (o controle primário acessível) + swatch de preview. A11y: `Label`+`htmlFor`,
  `aria-label` no input color, foco visível `ring-ring`, `aria-invalid` no hex inválido
  reaproveitando a validação. Mobile-first (390px): o hex textual é o caminho principal.
- Edição: rotas novas `dashboard/torneios/[id]/cores/page.tsx` e
  `dashboard/ligas/[id]/cores/page.tsx` (server-action, só dono), com **preview ao vivo**
  (mini-cabeçalho + botão) aplicando `champThemeProps`.

## 4. Schema (Zod) e Actions
- `src/schema/corSchema.ts`: `corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform(s =>
  s.toLowerCase())` (aceita maiúsculas no input, grava minúsculo p/ casar com o CHECK);
  `coresOpcionais` (ambas opcionais).
- `tournamentSchema.createTournamentSchema`: + `corPrimaria?`/`corSecundaria?`.
- `leaguePyramidSchema.createCompetitionSchema`: cores na pirâmide e em cada `divisoes[]`.
- `createTournament`: grava cores no INSERT.
- `createCompetition`: grava cores na competição e nas `division_seasons` da 1ª temporada.
- `montarProximaTemporada` (`actions/leaguePyramid.ts`): copiar cor nas **DUAS pontas**
  (a omissão de uma ponta = regressão silenciosa, classe de bug que o próprio arquivo
  alerta em `:1992-2018`):
  1. acrescentar `cor_primaria, cor_secundaria` ao `.select()` de `geometriaPorNivel` (`:1877`);
  2. acrescentar `cor_primaria: geo?.cor_primaria ?? null, cor_secundaria: geo?.cor_secundaria
     ?? null` ao objeto de `divisoesParaCriar` (`~:2010-2023`).
- Actions novas (só dono; checam posse por `created_by`/owner antes do UPDATE; revalidatePath):
  `atualizarCoresTorneio`, `atualizarCoresPiramide`, `atualizarCoresDivisao`.

## 5. Data layer (leitura + herança)
- **Torneio** (`torneios/[id]`): `getTournamentClassificacao` hoje faz `.select()` de
  colunas explícitas (`getTournamentClassificacao.ts:311`) e projeta `TorneioClassificacao`
  (`:18-30`) — ambos SEM cor. **Adicionar `cor_primaria, cor_secundaria`** ao `.select()`
  e ao tipo. Resolver cor efetiva:
  - se `tournaments.cor_*` não-null ⇒ usa.
  - senão, **fallback de divisão**: `select cor_primaria, cor_secundaria,
    league_competitions(cor_primaria, cor_secundaria) from league_division_seasons where
    tournament_id = $id or tournament_id_clausura = $id or final_tournament_id = $id` →
    `division.cor_* ?? competition.cor_*`. Encapsular em `resolverCoresTorneio(supabase,
    id, torneio)` (1 query extra só quando cor null). Assim o fluxo de lançar placar
    (que abre a página do torneio da divisão) também aparece tematizado.
- **Liga** (`ligas/[id]`): `getSeason` passa a trazer `competition.cor_*` e, por divisão,
  `division_seasons.cor_*`. A página resolve `divisao.cor ?? competicao.cor` e aplica
  `champThemeProps` em cada `DivisaoCard`. Header da pirâmide e seções cross-divisão
  (Playoffs, Fim de temporada) usam a cor **da competição** (ou base).

## 6. Zonas semânticas (alinhamento spec↔código)
Hoje o `StandingsTable` pinta a zona de **acesso** com `--primary` (`:161,167`) e a de
**queda** com `--destructive` (`:queda`). Decisão: **a zona de PERIGO (queda/playout)
permanece semântica** (vermelho `--destructive`, fixo); **a zona de ACESSO pode adotar a
primária do campeonato** — é o comportamento atual (já usa `--primary`) e amarra o
destaque de promoção à identidade. A spec é ajustada para refletir isso (não exige token
novo nem mudança no StandingsTable). Validação 6.3 confere: queda sempre vermelha; acesso
na cor do campeonato.

## 7. Compatibilidade e riscos
- **Backward-compat:** colunas *nullable*; campeonatos atuais (cores null) idênticos.
- **Legibilidade:** mitigada pela normalização `oklch` por tema; validação ao vivo em
  claro E escuro a 390px com par vívido.
- **Browser sem relative-color:** fallback usa cor crua + `--primary-foreground` derivado
  por luminância no helper (funcional; AA garantido só no caminho moderno).
- **Ordem de implementação:** gerar `database.types.ts` a partir do **LOCAL** logo após a
  DDL local (antes dos `.select()`/actions), p/ os tipos explícitos baterem.
- **next/og (futuro):** a imagem calculará as cores derivadas em JS (Satori não tem
  `oklch(from)`), passando hex concretos — fora desta change.
