# Design — add-match-engagement

## Context

`users.celular` existe desde o início (validação BR no signup, RLS
`users_select_authenticated`); o único consumo é o atalho do MatchScoreModal
(client, chat vazio). O re-engajamento pede o atalho nas superfícies de
listagem com mensagem pronta — sem ampliar o tráfego de PII além do
necessário.

## Goals / Non-Goals

**Goals:**

- Um toque para cobrar o adversário, do dashboard ou da página do torneio,
  com mensagem contextualizada.
- Exposição de celular CONTIDA: só o adversário direto, só no HTML de quem
  tem a partida.

**Non-Goals:**

- Notificação ativa (e-mail/push) — exigiria infra de envio; fica para
  feedback futuro.
- Cobrança pelo DONO (modelo árbitro) — decisão de produto: só o adversário.
- Editar/armazenar mensagens.

## Decisions

### D1 — Helper puro único (`src/lib/whatsapp.ts`)

`linkWhatsApp(celular, texto?)` extrai a normalização hoje duplicável do
modal (11 dígitos → DDI 55; 13 iniciando em 55 → direto; senão null) e anexa
`?text=` com `encodeURIComponent`. `mensagemConvocacao({ adversario, titulo,
tournamentId })` monta o texto com a URL absoluta da página do torneio via
`env.NEXT_PUBLIC_SITE_URL` (sempre presente — default localhost). Fonte única
para modal, card e lista.

### D2 — Gate de participante decidido no SERVIDOR, dado contido por RSC

`MatchCard` e `OpenMatchesList` são RSC: o botão (um `<a>` simples) só é
renderizado quando `userId` é `participante_1` ou `participante_2` E o
adversário tem celular normalizável. O celular cru só existe no servidor; o
que chega ao browser é o `href` final — e somente para quem joga a partida.
Nenhum estado/JS novo no client.

### D3 — `PartidaAberta` ganha lados (ids + celulares); histórico NÃO

O atalho só faz sentido em partida em ABERTO. `partidasEncerradas` e demais
projeções ficam como estão — o select de embeds ganha `celular` uma única vez
(mesma viagem), e apenas a projeção de abertas o carrega adiante.

### D4 — Mensagem

"Fala, {adversario}! Bora jogar nossa partida do {titulo} no Arena?
{siteUrl}/dashboard/torneios/{id}" — nome com fallback ("Fala! Bora…" sem
nome), título com trim/fallback "nosso torneio". Sem emoji (codificação
segura em qualquer handset) e curta o bastante para o preview do WhatsApp.

## Riscos / Trade-offs

- **[PII no modal do dashboard]** → inalterado (risco aceito desde a Fase 5:
  o modal client recebe celular dos dois lados). Esta entrega NÃO amplia: as
  superfícies novas são RSC com gate de participante.
- **[Celular no href]** → quem É o adversário recebe o número no HTML — é o
  propósito do atalho (mesma exposição do botão atual do modal).
- **[NEXT_PUBLIC_SITE_URL em previews]** → previews da Vercel apontam para a
  URL canônica fixada em build (limitação já documentada no deploy) — o link
  da mensagem leva à produção, comportamento aceitável.

## Migration Plan

Nada (zero DDL). Deploy normal.

## Open Questions

Nenhuma.
