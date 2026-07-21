## Why

Quarta entrega da frente mobile, fechando **a mesma classe de defeito** que a change
`mobile-cards-partida` corrigiu nos cards de partida: uma linha horizontal onde um grupo
`shrink-0` (badges + botões + pílulas) não encolhe, a identidade ao lado tem `min-w-0` e
por isso é ela — o **nome** — que absorve toda a falta de espaço, até virar reticências.

O caso mais grave não é cosmético. Em `FluxoTemporadaPanel.tsx:572` a linha do competidor
gasta, em 390px de viewport (~316px úteis dentro do card):

| elemento | largura |
|---|---|
| pílula de destino (sobe/cai/permanece) | ~91px |
| pílula de motivo (Playoff/Sorteio/Ajuste) | ~78px |
| coluna de setas do desempate | 36px |
| posição (`Nº`) | 28px |
| escudo/avatar | 24px |
| 5 gaps de 10px | 50px |
| **sobra para o nome** | **~17px (~3 caracteres): "Fla…"** |

É a tela onde o dono decide **quem sobe e quem cai de divisão**, e ele não consegue ler de
quem está falando. Na mesma linha há um risco de toque real: as setas subir/descer estão
empilhadas com `gap` ZERO, borda com borda. São ações OPOSTAS e irreversíveis no desempate
que define o rebaixamento; com o polegar (~34-45px de contato) o dono dispara "descer"
querendo "subir".

Mais oito superfícies repetem o arquétipo, medidas em 390px:

- `TeamSection.tsx:102` — `TeamRoleBadge` + `RemoveMemberButton` num `shrink-0`; o nome do
  membro some (~278px úteis).
- `dashboard/explorar/page.tsx:29` — a tela cuja ÚNICA função é reconhecer competições:
  nome em ~120px e a segunda linha corta o "por Fulano", que é o único desempate entre
  competições homônimas.
- `ConfrontoDiretoPanel.tsx:120` e `ConfrontoTecnicosPanel.tsx:121` — cabeçalho 3-up numa
  linha só, ~83px por nome. São espelhos um do outro: tratar só um vira dívida. Junto,
  `ConfrontoTecnicosPanel.tsx:124` tem hierarquia invertida — o número do centro (empates)
  é MENOR que os das pontas.
- `MuralhaRanking.tsx:71`/`:76` — o badge "N clean sheets" (~88px, `shrink-0`) come o nome,
  e a linha secundária vira "12 gols sofridos em 1…", perdendo o total de jogos, que é o
  DENOMINADOR sem o qual o clean sheet não significa nada.
- `EdicaoParticipantesPanel.tsx:253` — ~112px para nome + origem; a linha de origem é a
  única forma de conferir de onde veio uma vaga derivada.
- `CardVitrineDemo.tsx:25` — coluna de nome cai a ~58px quando há ação de gestão. É a
  vitrine pública da demo: quebra aqui custa conversão.
- `IniciarMataMataPanel.tsx:188` — `grid-cols-[1fr_auto_1fr]` mantém dois selects lado a
  lado no mobile, ~87px cada (~12 caracteres): "Sport Club do Recife" fica irreconhecível.

E um defeito de informação: `FluxoTemporadaPanel.tsx:628`/`:636` explicam os chips
Playoff/Sorteio/Ajuste **apenas** em `title="..."`. Tooltip nativo não abre em toque — no
celular essa explicação simplesmente não existe.

## What Changes

Só apresentação, reutilizando a receita já validada em `MatchHistoryList.tsx` +
`PartidaIdentidade.tsx`:

1. **A identidade ganha a linha.** Onde o cluster fixo é largo, ele sai da linha da
   identidade e vai para uma segunda faixa no mobile (`flex-col` → `sm:flex-row`), ou é
   recolhido num `<details>` nativo quando é secundário.
2. **`shrink-0` deixa de ser aplicado a cluster largo.** Onde o cluster precisa continuar
   inline, ele passa a poder encolher/quebrar (`flex-wrap`), e quem trunca é ele, não o nome.
3. **Setas de desempate ganham separação real** (`gap-1.5` no mobile), sem estourar a
   altura da linha — a reestruturação em duas faixas paga o espaço.
4. **Os chips de motivo ganham texto visível no mobile**, substituindo a dependência de
   `title`; o `title` permanece para o desktop/mouse.
5. **Hierarquia do 3-up corrigida**: o número do centro passa a ter o mesmo peso dos das
   pontas nos DOIS painéis de confronto (mudança espelhada, byte a byte equivalente).

**Decisões travadas (não reabrir):**

1. **Zero DDL, zero Server Action, zero fetcher, zero RLS, zero regra de negócio.**
   `proxy.ts`/middleware intocados.
2. **Desktop preservado.** Todo comportamento novo é mobile-first e revertido em `sm:`/`md:`.
3. **Componentes RSC continuam RSC.** Nada de `"use client"` novo; disclosure é `<details>`
   nativo (a fronteira RSC já corrompeu JSX de client component neste projeto —
   `fix-editar-placar-rsc`).
4. **Os dois painéis de confronto mudam JUNTOS**, com a mesma solução.
5. **Nenhum gate de exibição/autorização muda** — `podeRemover`, `ajusteBloqueado`,
   `reordenavel`, `onToggleListar` e os gates da vitrine ficam idênticos.

## Impact

- **Specs**: `design-system` — três requirements novos (identidade legível em linha densa,
  separação entre controles de ação oposta, informação essencial fora do tooltip nativo).
- **Código** (só apresentação): `FluxoTemporadaPanel.tsx`, `TeamSection.tsx`,
  `app/dashboard/explorar/page.tsx`, `ConfrontoDiretoPanel.tsx`, `ConfrontoTecnicosPanel.tsx`,
  `MuralhaRanking.tsx`, `EdicaoParticipantesPanel.tsx`, `CardVitrineDemo.tsx`,
  `IniciarMataMataPanel.tsx`.
- **Testes**: cobertura nova onde a estrutura mudou; testes irmãos existentes atualizados.
- **Banco/infra**: nenhum.
