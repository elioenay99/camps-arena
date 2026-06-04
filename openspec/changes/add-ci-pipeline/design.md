## Context

O repositório está em `github.com/elioenay99/camps-arena` (privado), com toolchain já
pronto: `pnpm@10.33.2` (pinado em `packageManager`), Node 22 local (`v22.22.2`),
`pnpm-lock.yaml` presente, e scripts `lint` (eslint), `test` (`vitest run`, 72 testes)
e typecheck via `tsc`. Não há `.github/` ainda nem nenhum CI. Os testes são herméticos
(mocks de Supabase, `next/cache`, `server-only` e da API-Football), então o CI não
precisa de segredos. Este é o rank 1 do Tier 0: a barreira que protege as próximas
mudanças.

## Goals / Non-Goals

**Goals:**
- Rodar typecheck + lint + testes automaticamente em PRs para `main` e push para `main`.
- Builds reproduzíveis (pnpm pinado, `--frozen-lockfile`, Node fixo).
- Feedback rápido (cache do store do pnpm) e sem custo de segredos.
- Estabelecer o status check que pode ser exigido na branch protection.

**Non-Goals:**
- Não roda `next build` neste change (precisaria de envs públicas e é mais lento;
  fica como possível follow-up). Os gates atuais (tsc/lint/test) já cobrem o essencial.
- Não configura branch protection no GitHub (isso é setting do repositório, fora do
  arquivo de workflow — ver Migration Plan).
- Não adiciona deploy/preview (já é responsabilidade da Vercel).
- Não cobre testes E2E (não existem ainda; estão no roadmap, rank 14).

## Decisions

### D1 — GitHub Actions como plataforma de CI
O repo já está no GitHub; Actions é nativo, gratuito dentro das cotas para repositório
privado e tem ações oficiais maduras. Alternativas (CircleCI, etc.) adicionariam um
serviço externo sem ganho. A Vercel roda build no deploy, mas não executa nossa suíte
de testes em PR — não substitui o gate.

### D2 — Instalação: `pnpm/action-setup` + `actions/setup-node` com cache `pnpm`
Padrão recomendado: `pnpm/action-setup@v4` (lê a versão de `packageManager`, sem
hardcode duplicado) instala o pnpm; depois `actions/setup-node@v4` com
`cache: 'pnpm'` reaproveita o store entre execuções. `actions/checkout@v4` no início.
Instalação com `--frozen-lockfile` garante paridade com o lockfile.

### D3 — Node 22 LTS
Fixar `node-version: 22` espelha o ambiente local (`v22.22.2`), evitando divergência
dev↔CI. Não usar matrix de versões: o app roda numa versão só; matrix gastaria runner
minutes sem valor agora.

### D4 — Job único, passos sequenciais
Um job `quality` com passos `install → typecheck → lint → test`, nessa ordem. Sequencial
é mais simples e barato que um job por gate; o passo que falha aborta o restante e
identifica claramente a causa. Se no futuro o tempo incomodar, dá para paralelizar em
jobs independentes (trade-off: mais minutos de runner).

### D5 — Concurrency com cancelamento
`concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` cancela
execuções obsoletas do mesmo PR quando há novo push, economizando minutos.

### D6 — Script `typecheck` no package.json
Adicionar `"typecheck": "tsc --noEmit"` ao `package.json` para o CI (e o dev) terem um
comando único e explícito, em vez de `pnpm exec tsc --noEmit` espalhado. Mudança mínima
e não-quebrante.

## Risks / Trade-offs

- **O workflow reporta status, mas não bloqueia merge sozinho** → a obstrução de merge
  exige branch protection com "required status check" nas configurações do GitHub
  (Settings → Branches). Documentado no Migration Plan; é ação manual do usuário (dono
  do repo), fora do escopo de arquivo.
- **Cota de Actions em repo privado** → uso é baixo (1 job curto por PR/push) e o
  cancel-in-progress reduz desperdício; dentro da cota gratuita esperada.
- **Divergência de versão de Node/pnpm dev↔CI** → mitigada por pinar pnpm via
  `packageManager` e Node 22 fixo; se o local mudar, atualizar ambos.
- **Ausência de `next build` no gate** → typecheck cobre erros de tipo, mas não pega
  100% de problemas de build do Next. Aceito por ora (Non-Goal); a Vercel pega no
  deploy e um follow-up pode adicionar o build ao CI.

## Migration Plan

1. Mesclar este change cria `.github/workflows/ci.yml`; o CI passa a rodar a partir do
   próximo PR/push.
2. **Ação manual do usuário (dono do repo)** para tornar o gate obrigatório: em
   GitHub → Settings → Branches → Branch protection rule para `main` → marcar
   "Require status checks to pass before merging" e selecionar o check `quality`.
   (Não é feito pelo agente — é configuração de repositório.)
3. Rollback: remover o arquivo de workflow (e a regra de branch protection, se criada)
   reverte o comportamento; nenhum efeito colateral em código de aplicação.
