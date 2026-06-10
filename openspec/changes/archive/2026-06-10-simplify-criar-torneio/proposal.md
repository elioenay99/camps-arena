# Proposal — simplify-criar-torneio

## Why

A tela de criação de torneio era um paredão de campos: o **formato** vinha como 5
radios com parágrafos longos, e **Pontos por resultado** aparecia SEMPRE — mesmo
em avulso e mata-mata, onde não há tabela (pura distração). Pedido do usuário:
deixar a criação "absurdamente melhor", mais bonita E mais simples para o criador.

## What Changes

- **Formato em CARDS** (grid 2-col): cada formato como card selecionável com ícone
  (de `FORMATO_META`), nome e descrição curta — escaneável, não mais texto corrido.
  Os cards são `<label>` com radio `name="formato"` (mesma submissão e a11y; foco
  visível via `has-[:focus-visible]`).
- **Revelação progressiva**: fora do avulso, abre um painel (com `animate-rise`)
  com só o que se aplica ao formato — Clubes, Ida e volta, 3º lugar — e **Pontos
  por resultado SÓ em formatos com tabela** (liga, grupos+mata, fase de liga).
  Avulso e mata-mata não mostram pontos. Avulso fica mínimo (só título, formato,
  público).
- **Layout**: página mais larga (`max-w-xl`) com profundidade (`.elevate`); opções
  como linhas-checkbox; `FORMATO_META` ganha `desc` (reutilizável).
- **Contrato inalterado**: `createTournament`/FormData seguem iguais — radio
  `formato`, hidden `clubes`, checkboxes por presença; pontos ausentes caem nos
  defaults do schema (3/1/0). Sem mudança de dados/validação/segurança.

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO à criação em
`tournament-management` (o comportamento de dados permanece o requisito existente).

## Impact

- **`TournamentForm.tsx`** (reescrito: cards + disclosure), **`formatoMeta.ts`**
  (+`desc`), **`torneios/novo/page.tsx`** (largura + elevate). Sem mudança em
  action/schema/banco.
- **Validação ao vivo (feita)**: avulso (mínimo), liga (clubes+ida/volta+pontos),
  mata-mata (clubes+ida/volta+3º, SEM pontos). Gates typecheck/lint/test(848)/build
  verdes.
- **Risco**: baixo — UI client, contrato do form preservado, sem teste de form
  pré-existente quebrado.
