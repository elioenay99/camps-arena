# Tasks — polish-paineis-inicio

## 1. Primitivos compartilhados

- [x] 1.1 `iniciar-panel-ui.tsx` (sem `"use client"`): `PainelInicioShell` (card
      `.elevate`, ícone do formato em chip, título `font-display`, badge
      `StatusPill` com `status` real, chips de opções), `PreviaBox` (caixa
      destacada), `ModoCard` (label-card com radio `sr-only`, ícone+título+
      descrição, estados selecionado/hover/desabilitado — disabled mantém a dica
      legível).

## 2. Aplicar aos três painéis (lógica/contrato preservados)

- [x] 2.1 `IniciarTorneioPanel` (liga, RSC): shell + PreviaBox + botão; gates
      status/alert mantidos (botão sempre presente, desabilitado no inválido).
- [x] 2.2 `IniciarMataMataPanel` (client): shell + PreviaBox; modos Sorteio/Potes/
      Manual como `ModoCard` (Shuffle/Layers/Hand), potes desabilitado fora de
      4/8/16/32; cabeças e confrontos manuais em container `animate-rise`.
- [x] 2.3 `IniciarGruposPanel` (client): shell (ícone Boxes/LayoutGrid conforme
      faseLiga) + selects grupos/classificados (grid responsivo) + PreviaBox;
      modos como `ModoCard` (omite potes/manual na fase de liga); cabeças e
      grupo-por-clube em container `animate-rise`.
- [x] 2.4 `page.tsx`: encaminha `status={torneio.status}` aos três painéis.

## 3. Validação

- [x] 3.1 Gates: typecheck / lint / test (848/848) / build.
- [x] 3.2 Ao vivo (Playwright): liga, mata-mata (sorteio/potes/manual + N=6
      desabilitado), grupos (sorteio/potes/manual), fase de liga e recuperação
      (badge Ativo) — nos 2 temas (Dracula/Canarinho) + mobile 390px.
- [x] 3.3 Workflow adversarial (15 confirmados, approved_with_nits); fixes
      aplicados (dica do disabled legível, focus-ring offset, status real,
      grid responsivo 390px, ícones, JSDoc do id); commit + push + CI + archive.
