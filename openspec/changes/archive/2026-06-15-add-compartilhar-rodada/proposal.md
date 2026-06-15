# Proposal — add-compartilhar-rodada

## Why

Com a **liberação de rodadas** (change 2) entregue, o dono revela as rodadas quando quer.
Falta o último pedaço já desenhado com o dono: **ao liberar, o app preparar o anúncio da
rodada para o WhatsApp** — uma **imagem** estilo Brasileirão (os confrontos da rodada) e um
**texto** com a lista derivada dos participantes. É a change 3 (e última) do conjunto cores
→ liberação → WhatsApp; ela **consome as cores** (change 1) na imagem e o **gating de
rodada** (change 2) para saber o que está liberado.

Decisões de produto já tomadas com o dono (não reverter sem perguntar):
- **"App prepara, você envia"**: no celular, **Web Share API** (1 toque → escolhe o grupo);
  no desktop, **baixa a imagem + copia o texto + abre `wa.me`**. SEM API oficial/automação
  (a Meta API não posta em grupo, tem custo, e libs não-oficiais violam ToS). Texto
  pré-preenchido NÃO vira menção real.
- **Lista = DERIVADA dos dados**: cada vaga → comandante (`tournament_slots.user_id` →
  `users.nome` + `wa.me` do `users.celular`); vaga sem usuário = **❌**. Zero manutenção. O
  dono **reconfirmou (2026-06-14)** incluir o `wa.me` de cada comandante no texto, ciente de
  que os telefones ficam visíveis no grupo (são participantes que cadastraram o celular).
- **Imagem** via `next/og`/Satori (reusa `src/features/og`): cabeçalho + "Nª RODADA" +
  linhas de confronto com escudos (`teams.escudo_url`); por-nome usa **monograma**. Consome
  as cores do campeonato.

Decisões desta change:
- **Unidade de compartilhamento = a RODADA** (revisão de decisão de produto **confirmada
  com o dono via AskUserQuestion 2026-06-14**). A decisão anterior era "liberar tudo / fase
  de grupos ⇒ sem imagem, só lista"; o dono optou por **sempre por-rodada com imagem**: cada
  rodada **liberada** ganha um botão "Compartilhar" com a imagem daquela rodada + a legenda.
  Não há imagem agregada de fase/temporada — compartilha-se rodada a rodada (cada uma com
  sua imagem), cobrindo "fase de grupos / tudo" sem gerar um PNG gigante nem um caminho
  só-texto separado.
- **Só o dono compartilha** (espelha "o dono libera e manda"). A rota da imagem é
  auth-gated e checa posse; o texto é montado no servidor (o celular só entra embutido no
  `wa.me`, nunca cru no client).
- **Sem DDL**: tudo deriva de `matches`/`tournament_slots`/`users`/`teams`/cores existentes.

## What Changes

- **Imagem da rodada (rota dinâmica)**: novo Route Handler GET
  `app/dashboard/torneios/[id]/rodada/[rodada]/imagem/route.tsx` que devolve um PNG
  (`next/og`/Satori, ~1080×1080) com a marca + "Nª RODADA" + os confrontos (escudo ou
  monograma × escudo ou monograma), tematizado pelas **cores** do campeonato
  (`resolverCoresTorneio`, hex; fallback tema base). Auth-gated (proxy) + checagem de posse
  (`created_by`). Reusa as fontes/logo do OG (refatorando `brand.tsx` para exportar
  `carregarAssets`). Escudos remotos são buscados e embutidos como data URL (com fallback
  para monograma quando ausente/por-nome).

- **Fetcher enxuto** `getPartidasDaRodada(supabase, tournamentId, rodada)`
  (`src/features/match/data/`): seleciona só as `matches` da rodada (reusa o embed
  `v1/v2 → team/rotulo`), devolvendo por lado `{ nome, escudoUrl | null, porNome }`. Mais
  barato que `getTournamentClassificacao` (que puxa o torneio inteiro) e expõe `porNome`
  explícito para o monograma.

- **Texto do anúncio** `mensagemRodada(...)` em `src/lib/whatsapp.ts` (irmã de
  `mensagemConvocacao`, fonte única): cabeçalho + "Nª rodada" + uma linha por confronto
  (clube × clube; comandante ou ❌) + a URL absoluta da página (`NEXT_PUBLIC_SITE_URL`).
  Sem emoji. Montado no **servidor** a partir dos dados já carregados na página (sem query
  extra por rodada).

- **Compartilhar (UI)**: componente client `CompartilharRodadaButton`
  (`src/features/match/components/`) no padrão das folhas existentes (`useTransition` +
  `sonner`, botão verde + ícone). No celular usa `navigator.canShare({files})` →
  `navigator.share({ files:[png], text, title })`; no desktop cai no fallback (copiar texto
  + baixar PNG + abrir `https://wa.me/?text=`). `AbortError` (cancelamento) não vira erro. O
  PNG é buscado on-demand da rota de imagem (`fetch` same-origin com cookie). Inserido na
  seção "Liberação de rodadas" (page.tsx), um por rodada **liberada** (só dono).

## Impact

- **Specs**: `match-engagement` (texto da rodada + compartilhar) e `og-images` (rota
  dinâmica autenticada da imagem da rodada).
- **Banco**: **nenhuma DDL** — sem migração, sem promoção a prod via MCP.
- **Build**: a nova rota é **dinâmica** e lê assets via `readFile(process.cwd())` (fontes/
  logo do OG) → **precisa** ser adicionada ao `outputFileTracingIncludes` do `next.config.ts`
  (espelhando as entradas de OG), senão o build passa mas a imagem quebra com ENOENT em
  runtime no Vercel.
- **Código**: `src/lib/whatsapp.ts`, `src/features/og/brand.tsx` (exportar
  `carregarAssets`) + nova `src/features/og/rodada.tsx` (render), nova rota de imagem, novo
  fetcher, novo componente client, a seção em `app/dashboard/torneios/[id]/page.tsx`, e
  `next.config.ts` (file tracing).
- **Compatibilidade**: aditivo; não altera fluxos existentes. Só aparece para o dono, em
  rodadas liberadas, em formatos gerados (não avulso).
- **Fora de escopo**: automação/cron de envio, API oficial, imagem única agregada de
  fase/temporada, e qualquer menção real no WhatsApp.
