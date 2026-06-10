# Proposal — polish-pagina-torneio

## Why

A página do torneio (`/dashboard/torneios/[id]`) é onde dono/participantes vivem,
mas era um scroll longo e plano: header mínimo (título + uma linha muted) e ~10
seções, cada uma só um `<h2>` solto + conteúdo, sem hierarquia, profundidade nem
ícones. Próximo item do backlog de UI (maior retorno).

## What Changes

- **Header-hero**: painel elevado (`.elevate`) com o ícone do formato
  (`FORMATO_META`), o título grande (display) e CHIPS escaneáveis no lugar da
  linha muted — `StatusPill` (status) + formato + ida-e-volta + 3º lugar + pontos
  (V·E·D, só onde há tabela). Ação do dono (Nova partida) no canto.
- **`SecaoTorneio`** (helper): cada seção ganha heading com ícone consistente
  (Chave/Network, Grupos/Users, Classificação/ListOrdered, Partidas/Swords,
  W.O./Flag, Encerradas/History, Clubes/Shield) + ação opcional. Conteúdo intacto.
- **`EstadoVazioSecao`** (helper): estados vazios unificados — ícone com glow
  sutil + texto — no lugar dos `<p>` tracejados soltos.
- **`StatusPill` extraída** para `features/tournament/components/StatusPill.tsx`
  (fonte única: índice + página); "encerrado" passa a usar o dourado de conquista
  (`gold-ink`, legível nos 2 temas).
- Administração com ícone (Settings2) e rótulo uppercase discreto.

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO da página do
torneio em `tournament-management` (comportamento/dados inalterados).

## Impact

- **Editados**: `[id]/page.tsx` (header-hero + SecaoTorneio/EstadoVazioSecao nas
  seções; remove `subtitulo`/`LABEL_STATUS` locais), `torneios/page.tsx` (usa a
  `StatusPill` compartilhada). **Novo**: `StatusPill.tsx`.
- **Sem mudança**: queries, RLS, actions, motores, dados. Só layout/apresentação.
- **Validação ao vivo (feita)**: Liga em rascunho ("Diag Liga Bug") — header com
  formato/status/chips, Iniciar, Classificação (empty), Vagas com clubes,
  Administração. Gates typecheck/lint/test(848)/build verdes.
- **Risco**: baixo (presentational, RSC). Contraste AA a confirmar no chip de
  encerrado (gold-ink) — verificação adversarial.
