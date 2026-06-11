# Proposal — polish-convite-publico

## Why

A página pública `/convite/[codigo]` é a PRIMEIRA impressão de quem é convidado —
o funil de novos usuários. Hoje é um `Card` solto no vazio: sem atmosfera de
estádio, sem marca, com o clube/escudo reduzido a uma linha de 40px. Próximo item
#1 do backlog de UI ([[arena-ui-backlog]]), maior retorno de conversão.

## What Changes

Apresentação apenas — toda a lógica de dados, RPCs, precedência vaga→avulso,
estados e textos acessíveis permanecem byte-idênticos (cobertos por
`page.test.tsx`).

- **Moldura `ConviteShell`** (tipo `AuthShell`): `StadiumBackdrop` + marca Goliseu
  DISCRETA no topo (escudo G pequeno + `GOLISEU·`, link para `/`), conteúdo
  centrado com `animate-rise`. Tira o "card no vazio preto".
- **Herói = escudo do CLUBE** (decisão do usuário) no convite de vaga: `TeamCrest`
  grande (72px) num halo `glow-primary` + nome do clube em `font-display` +
  `em "{torneio}"`. O clube vira o centro da tela.
- **Heróis por estado** para os demais ramos: ícone temático em halo (Trophy no
  aceite avulso com o título do torneio; Ticket no deslogado; CircleCheck nos
  atalhos "Abrir o torneio"; Flag/Lock/UserX/ShieldAlert nos bloqueios), tom
  primário p/ ação e neutro p/ bloqueio.
- **Painel** unificado (`elevate`, centralizado) substitui o `Card` + `CardHeader`
  genérico "Convite".

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO do convite público
em `tournament-participants` (comportamento/dados/textos inalterados).

## Impact

- **Novo**: nenhum arquivo compartilhado obrigatório — `ConviteShell` e os helpers
  de herói vivem na própria página (`convite/[codigo]/page.tsx`), única rota que
  os usa.
- **Editado**: `src/app/convite/[codigo]/page.tsx` (só o JSX de apresentação).
- **Sem mudança**: RPCs (`info_convite`, `info_convite_vaga`), actions, RLS,
  precedência, textos/roles acessíveis, `page.test.tsx` (deve passar inalterado).
- **Risco**: baixo (presentational, RSC). Validar contraste AA nos 2 temas e o
  halo do escudo com clubes sem `escudo_url` (fallback de iniciais do `TeamCrest`).
