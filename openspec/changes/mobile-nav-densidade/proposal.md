## Why

Última entrega da frente mobile. Fecha duas dívidas que sobreviveram aos quatro lotes
anteriores: **onde a navegação mora** e **quanto o usuário precisa rolar para agir**.

### A navegação inteira está escondida atrás de um hambúrguer

Depois do login, os seis destinos do app (Painel, Torneios, Pirâmides, Copas, Explorar,
Nova partida) vivem numa `<ul>` colapsada dentro de `NavLinks.tsx`. No mobile, trocar de
seção custa: tocar o hambúrguer (canto superior esquerdo, longe do polegar), ler a lista,
tocar o destino. Nenhum destino é alcançável em um toque, e o usuário não vê onde está
sem abrir o menu.

O dono aprovou hoje uma **barra fixa no rodapé, só no mobile**, com os quatro destinos de
uso diário. O hambúrguer permanece — ele continua sendo o único caminho para Copas e Nova
partida, e continua sendo a navegação do desktop.

**Isto quebra uma premissa registrada em produção.** No lote 1
(`mobile-alvos-toque-safe-area`) o `<Toaster>` foi movido para `bottom-center` com a
justificativa **escrita no código** (`src/app/layout.tsx`) de que "nenhuma tela tem barra
de ação fixa no rodapé, então não há disputa de espaço". A partir desta change, toda a
subárvore autenticada tem. Sem tratamento, o primeiro toast do dashboard cobre a barra de
navegação inteira — inclusive o alvo de toque, porque o container do sonner tem
`z-index: 999999999`. O tratamento está desenhado em `design.md` e é parte do escopo, não
um detalhe de implementação.

### Oito superfícies onde a densidade custa rolagem ou conversão

Medidas em 390px de viewport (342px úteis dentro de `px-6`):

| # | Superfície | Defeito | Custo |
|---|---|---|---|
| 1 | `EmptyActiveMatches.tsx:45` | CTA cortado nos DOIS lados | conversão |
| 2 | `DemoRibbon.tsx:22` | faixa come ~185px | primeira dobra da vitrine |
| 3 | `VagasSection.tsx:135` | URL crua + 3 botões por vaga | ~11 telas |
| 4 | `LeagueWizard.tsx:935` | "Próximo" no fim do documento | ~3 telas |
| 5 | `CupWizard.tsx:315` + `LeagueWizard.tsx:1000` | rótulo do passo `hidden` | desorientação |
| 6 | `src/app/page.tsx:64` | `gap-16 px-6 py-16` sem passo responsivo | ~288px |
| 7 | `SignupForm.tsx:28`, `ForgotPasswordForm.tsx:27` | sucesso sem próximo passo | beco |
| 8 | `getVitrine.ts:49-76` | duas queries sem `.limit()` | risco latente |

Os dois primeiros são os de maior impacto e não são cosméticos:

**#1 é a primeira tela de quem acabou de se cadastrar.** O CTA "Criar meu primeiro
campeonato — leva 1 minuto" é o único elemento acionável do estado vazio. `buttonVariants`
declara `whitespace-nowrap shrink-0` (`src/components/ui/button.tsx:9`): o botão fica mais
largo que o card, estoura para fora nos dois lados e o texto é cortado **sem reticências**
— o usuário lê algo como "iar meu primeiro campeonato — leva 1 min". A combinação
`whitespace-nowrap` + `shrink-0` é justamente a que impede tanto a quebra quanto o
truncamento gracioso.

**#2 é a vitrine pública.** A frase "Todos os dados são fictícios e nenhuma alteração será
enviada ao sistema real." mede ~468px de texto em 342px úteis: quebra em duas linhas e,
somada ao seletor de perfil e aos dois botões, empurra a faixa a ~185px. Em 390px de altura
útil de primeira dobra, mais de um quarto da tela de entrada da demo é aviso.

## What Changes

### Parte A — barra de navegação inferior no mobile

Componente novo `BottomNav.tsx` na subárvore autenticada apenas:

- **4 destinos** (Painel, Torneios, Pirâmides, Explorar), ícone + **rótulo textual**,
  alvo ≥44px, estado ativo por `usePathname` com `aria-current="page"`.
- `fixed inset-x-0 bottom-0 sm:hidden` + `pb-[env(safe-area-inset-bottom)]` — o
  `viewportFit: "cover"` do lote 1 faz o inset resolver de verdade na PWA instalada.
- Altura publicada como `--nav-inferior-h` para que quem precisa respirar (conteúdo,
  wizard, toast) leia UM número, em vez de replicar constantes.
- **Ausente** na landing e em `/demo` (shell próprio, e a demo não pode importar do app
  privado — guard de isolamento).

**O conflito toast × barra é resolvido por CSS escopado**, não por um offset global que
levantaria o toast também na landing e na demo. Decisão e alternativas descartadas em
`design.md`.

### Parte B — densidade e rolagem

Só apresentação, com a única exceção do item 8 (teto defensivo no fetcher):

1. CTA do estado vazio passa a quebrar (`h-auto whitespace-normal max-w-full`), com varredura
   dos demais CTAs longos do app.
2. Aviso da demo ganha versão curta abaixo de `sm:` — **o aviso não some, só encurta**.
   Transparência da demo é obrigatória.
3. URL crua do convite vai para um `<details>` "Ver link"; console de moderação por vaga
   também recolhe. **A capacidade de copiar o link não muda** (`CopyVagaLinkButton` intacto).
4. Barra `Anterior / Próximo` do wizard vira `sticky` no mobile, ancorada **acima** da barra
   de navegação (as duas não podem se sobrepor — o wizard vive na subárvore autenticada).
5. Passo ATIVO ganha rótulo visível no mobile nos dois wizards (mudança espelhada).
6. Landing escalona espaçamento no mobile; desktop byte a byte igual em `sm:`.
7. Estado de sucesso dos dois formulários ganha a ação seguinte ("Ir para o login").
8. `.limit(60)` nas duas queries da vitrine.

**Decisões travadas (não reabrir):**

1. **Zero DDL, zero Server Action, zero RLS, zero regra de negócio.** `proxy.ts`/middleware
   intocados. O `.limit(60)` é teto defensivo: não muda ordenação nem filtro.
2. **Desktop preservado.** Todo comportamento novo é mobile-first, revertido em `sm:`/`md:`.
3. **Busca/filtro na vitrine está FORA de escopo** — o teto não é o começo de uma feature.
4. **Os dois wizards mudam JUNTOS** (passo ativo), com a mesma solução.
5. **Disclosure é `<details>` nativo.** Nada de `"use client"` novo em componente RSC — a
   fronteira RSC já corrompeu JSX de client component neste projeto
   (`fix-editar-placar-rsc`).
6. **Nenhum gate de autorização muda**: `podeModerar`, `torneioEncerrado`, `vaga.porNome`
   e os gates da demo ficam idênticos.

## Impact

- **Specs**: `app-shell` (requirement novo: navegação primária alcançável no mobile e
  convivência com camadas flutuantes) e `design-system` (requirements novos: rótulo de
  ação não pode ser clipado; ação de avanço alcançável; aviso obrigatório compacta sem
  sumir).
- **Código**: `BottomNav.tsx` (novo), `dashboard/layout.tsx`, `globals.css`,
  `EmptyActiveMatches.tsx`, `DemoRibbon.tsx`, `VagasSection.tsx`, `LeagueWizard.tsx`,
  `CupWizard.tsx`, `app/page.tsx`, `SignupForm.tsx`, `ForgotPasswordForm.tsx`,
  `getVitrine.ts`.
- **Testes**: suíte nova para a barra inferior (destinos, estado ativo, ausência fora da
  subárvore autenticada); cobertura do CTA que não pode mais ser clipado; testes irmãos
  atualizados; teste de isolamento da demo segue verde.
- **Banco/infra**: nenhum.
