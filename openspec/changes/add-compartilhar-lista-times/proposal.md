# Proposal — add-compartilhar-lista-times

## Why

A change `add-compartilhar-rodada` já deu ao dono o "app prepara, você envia" para uma
**rodada** (imagem + texto com `wa.me` por comandante). Falta o pedido análogo do dono: uma
**lista dos TIMES** do campeonato para compartilhar — útil para montar/atualizar o grupo do
WhatsApp dos técnicos (mandar a relação de clubes + o contato de cada técnico de uma vez),
independente de qualquer rodada estar liberada.

Pedido do dono (chat 2026-06-24, confirmado via AskUserQuestion):
- "Lista dos times tipo igual a da rodada, **mas sem foto** e com o `wa.me` em cada técnico,
  e o **emoji de ❌** nos que não têm."
- **Sem imagem** (diferente da rodada): é só **texto** para compartilhar — uma lista.
- Regra do ❌ **igual à rodada** (decidido no AskUserQuestion): ❌ aparece **só quando o time
  está sem técnico** (vaga aberta / por-nome). Técnico **sem celular** cadastrado aparece só
  com o **nome** (sem link e sem ❌); técnico **com celular** aparece com `nome: wa.me`.

## What Changes

- **Texto da lista de times** — nova função `mensagemListaTimes(...)` em
  `src/lib/whatsapp.ts` (fonte única, irmã de `mensagemRodada`/`mensagemConvocacao`):
  cabeçalho `<título> — Times`, **uma linha por time** e rodapé com a URL absoluta da página
  (`NEXT_PUBLIC_SITE_URL`). Cada linha:
  - técnico com celular → `<clube> — <nome>: <wa.me>`
  - técnico sem celular → `<clube> — <nome>`
  - sem técnico (vaga órfã / por-nome) → `<clube> — ❌`

  Reusa `linkWhatsApp` (o celular entra **embutido** no link, nunca cru). Sem emoji
  decorativo (o ❌ é unicode estável e desejado). Montado no **servidor**.

- **Resolução do celular dos técnicos** — na página do torneio (RSC), reusa
  `carregarCelulares(supabase, ids)` (RPC `celulares_de_contato`, SECURITY DEFINER, gated por
  co-participação) com os `user_id` dos técnicos das vagas já carregadas por
  `getVagasDoTorneio`. Sem nova query de listagem; sem expor `celular` cru no client. O dono
  é co-participante de todo técnico (via `tournaments.created_by` em `eh_co_participante`),
  então os links resolvem para quem compartilha.

- **Compartilhar (UI)** — novo componente client `CompartilharListaTimesButton`
  (`src/features/tournament/components/`), no padrão do `CompartilharRodadaButton` mas
  **sem arquivo/imagem**: no celular `navigator.share({ text, title })`; no desktop o
  fallback copia o texto e abre `https://wa.me/?text=`. `AbortError` (cancelamento) não é
  erro. Inserido no **cabeçalho da `VagasSection`** (junto do título "Vagas").

- **Gating** — o botão só aparece em torneio **competitivo** (`ehGerado`, que é onde a
  `VagasSection` já vive), com **vagas**, para quem **modera** (dono/admin/moderador). O
  texto é montado na página e passado pronto; quem não é co-participante dos técnicos recebe
  a lista com os nomes sem `wa.me` (degradação graciosa da RPC, sem vazamento).

## Impact

- **Specs**: `club-slots` (texto da lista de times + controle de compartilhar a lista).
- **Banco**: **nenhuma DDL** — deriva de `tournament_slots`/`users`/`teams` já existentes; a
  PII (`celular`) só pela RPC `celulares_de_contato` que já existe.
- **Build**: nada de file-tracing/rota nova (não há imagem). Aditivo.
- **Código**: `src/lib/whatsapp.ts` (+`mensagemListaTimes`), novo
  `CompartilharListaTimesButton`, `VagasSection` (slot de ação no cabeçalho),
  `app/dashboard/torneios/[id]/page.tsx` (carrega celulares das vagas + monta o texto + passa
  à `VagasSection`). Testes: `whatsapp.test.ts` (casos da lista) + teste do novo componente.
- **Compatibilidade**: aditivo; não altera fluxos existentes. Não aparece no avulso
  (participantes, não clubes/técnicos) nem para quem não modera.
- **Fora de escopo**: imagem/`next/og` da lista, automação/cron de envio, API oficial da
  Meta, lista no avulso (participantes) e qualquer menção real no WhatsApp.
