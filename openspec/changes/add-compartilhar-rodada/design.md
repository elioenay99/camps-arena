# Design — add-compartilhar-rodada

## Contexto (mapeado por workflow de leitura)

- `src/features/og/brand.tsx`: `renderBrandOg()` → `ImageResponse` (Satori), com
  `carregarAssets()` (fontes SpaceGrotesk `.woff` + logo `icon.svg`), `OG_SIZE` 1200×630,
  cores em HEX (`#bd93f9`/`#282a36`…). Satori = flexbox-only, sem grid, sem oklch, sem
  `next/image`. Hoje só estático (file-convention `opengraph-image.tsx`).
- `src/lib/whatsapp.ts`: `linkWhatsApp(celular, texto?)` (normaliza BR: 11→+55, 13 com 55)
  e `mensagemConvocacao(...)` (texto 1-a-1, sem emoji, URL absoluta via
  `NEXT_PUBLIC_SITE_URL`). Fonte única.
- `getTournamentClassificacao`: já dá `partidasAbertas` (com `rodada`, `nome_1/2`,
  `escudo_1/2`, `tecnico_1/2`, `participante_1/2={id,celular}`, `orfao_1/2`),
  `partidasEncerradas`, `rodadasLiberacao`/`proximaRodadaOculta`, e
  `resolverCoresTorneio(supabase,id,torneio)→{primaria,secundaria}` (hex, herança divisão).
  É caro (torneio inteiro + `computeStandings`) e NÃO expõe `porNome` por lado.
- `src/proxy.ts` (middleware): exclui `opengraph-image`/`twitter-image` do nonce/CSP, mas
  `/dashboard/...` passa pelo auth-gate + CSP. Um PNG sob `/dashboard` é auth-gated (bom) e
  CSP não quebra imagem (sem scripts).
- `next.config.ts`: `images.remotePatterns` cobre `media.api-sports.io` e `*.supabase.co`
  (isso é p/ `next/image`; o Satori busca o escudo direto — basta a URL ser alcançável).
  `outputFileTracingIncludes` já inclui os assets do OG (fontes/logo) — reusar
  `carregarAssets` mantém o tracing.
- `navigator.share` NÃO é usado no projeto (greenfield); `navigator.clipboard` sim
  (`SlotInviteButtons`/`InviteControls` — padrão do fallback).
- `TeamCrest.tsx`: `iniciais()`/`corDoNome()` (monograma) — é client/`next-image`, NÃO
  reusável no Satori; replicar inline na rota de imagem.

## Decisões de design

### D1 — Imagem por Route Handler GET dinâmico, auth-gated, só-dono
Nova rota `app/dashboard/torneios/[id]/rodada/[rodada]/imagem/route.tsx` (GET) que devolve
`ImageResponse`. Roda server-side com os cookies do dono (`createClient` server → RLS).
Checa posse numa única viagem que JÁ traz o que a imagem precisa:
`tournaments.select("id, titulo, cor_primaria, cor_secundaria").eq("id",id).eq("created_by",user.id).maybeSingle()`
(o objeto `torneio` com as cores alimenta `resolverCoresTorneio` sem refetch, e o `titulo`
vai ao cabeçalho). Se não achar → **`new NextResponse(null, { status: 404 })` explícito**
(NÃO `notFound()`: este é semântica de página/RSC, não de Route Handler — o único route
handler do repo, `auth/confirm/route.ts`, sempre devolve `NextResponse`). Diferente do brand
(estático, anon): aqui é fetch autenticado do próprio dono, dinâmico, lê dados.
Tamanho: **1080×1080** (quadrado — encaixa bem em status/preview de WhatsApp).

### D2 — Refatorar `brand.tsx` para exportar `carregarAssets`
Extrair/`export` `carregarAssets()` (fontes + logo) de `brand.tsx` e um novo
`src/features/og/rodada.tsx` com `renderRodadaOg({ titulo, rodada, confrontos, cores })` →
`ImageResponse`, reusando os assets. Mantém uma fonte única de fontes/logo (sem duplicar
leitura nem quebrar `outputFileTracingIncludes`).

### D3 — Fetcher enxuto `getPartidasDaRodada`
`src/features/match/data/getPartidasDaRodada.ts`:
`matches.select("<embed v1/v2 → team{nome,escudo_url}+rotulo>").eq("tournament_id",id).eq("rodada",N)`,
ordenado por `posicao`/`perna`/`created_at`. Devolve `confrontos: { lado1, lado2 }[]` onde
cada lado = `{ nome: team?.nome ?? rotulo ?? "A definir", escudoUrl: team?.escudo_url ?? null,
porNome: team == null && rotulo != null }`. A RLS entrega tudo ao dono. Avulso (rodada null)
não se aplica. Usado SÓ pela rota de imagem (a legenda usa os dados já carregados na page).
- **Bye/TBD**: pular confrontos de bye e lados vazios (vaga nula) — sem o filtro de bye que
  o `getTournamentClassificacao` aplica, um lado nulo viraria nome "A definir" e o monograma
  desenharia "A" (enganoso). Lado sem vaga ⇒ placeholder neutro (traço), não monograma.
- **Mata-mata ida-e-volta**: as 2 pernas compartilham o MESMO `rodada` (só muda `perna`) —
  `eq("rodada",N)` sem dedup listaria A×B (perna 1) e B×A (perna 2). Deduplicar por confronto
  quando `perna != null` (uma linha por par; rótulo "ida e volta"). Na liga, ida/volta caem
  em rodadas diferentes (numeração contínua) — sem dedup.

### D4 — Escudos via data URL (robustez) + monograma
Na rota, para cada `escudoUrl`: `fetch(url, { signal: AbortSignal.timeout(2000) })`
server-side → `arrayBuffer` → `data:<mime>;base64,…`, todos em **paralelo** (`Promise.all`).
`fetch` não tem timeout default → o `AbortSignal.timeout` evita pendurar a request num
escudo lento (trata `AbortError` no try/catch). Falha/timeout/ausência ⇒ **monograma**:
`<div>` flex com a 1ª letra do nome sobre `corDoNome(nome)` (replicado inline;
determinístico). Lado vazio (bye/TBD) ⇒ placeholder neutro, não monograma. Nunca quebra a
imagem.

### D5 — Cores hex, fallback tema base
`resolverCoresTorneio(supabase, id, torneio)` → `{primaria, secundaria}` (hex ou null).
A imagem usa `primaria` como destaque e `secundaria`/tema base no fundo; texto via
`onColor(hex)` (luminância). `{null,null}` ⇒ tema Dracula da `brand.tsx`
(`FUNDO #282a36` / `ROXO #bd93f9`). Tudo hex (CHECK no banco garante) — Satori-ok.

### D6 — Texto `mensagemRodada` (server) a partir dos dados já carregados
`mensagemRodada({ titulo, rodada, linhas, tournamentId })` em `whatsapp.ts`. Cada lado com
comandante mostra o nome + o link `wa.me` (decisão do dono confirmada 2026-06-14: incluir o
`wa.me` de cada comandante); lado sem comandante (órfão/por-nome) ⇒ ❌:
```
{Titulo} — {N}ª rodada

{nome_1} ({comandante_1} {wa.me/55...}) x {nome_2} (❌)
...

Acompanhe: {NEXT_PUBLIC_SITE_URL}/dashboard/torneios/{id}
```
As `linhas` saem das `partidasAbertas` + `partidasEncerradas` JÁ carregadas na page,
**mescladas e filtradas por `rodada`** (para casar com a imagem, que traz TODAS as partidas
da rodada — ver D3). Cada linha: `nome_1/2` + comandante (`tecnico_1/2.nome` no competitivo,
participante no avulso) + `linkWhatsApp(celular)` quando houver; órfão/por-nome/sem celular ⇒
❌ (sem link). **Sem query extra por rodada** (usa os dados já carregados). Sem emoji
decorativo (o "❌" é caractere unicode estável e desejado). O número entra embutido no `wa.me`
(é a escolha consciente do dono); o texto é montado no SERVIDOR (RSC) e passado como string
ao client — o celular cru nunca é prop separada. NOTA PII: jogos já encerrados em
`partidasEncerradas` não trazem contato → essas linhas saem só com nomes (sem `wa.me`),
aceitável (jogo já disputado não precisa de convocação).

### D7 — `CompartilharRodadaButton` (client)
`src/features/match/components/CompartilharRodadaButton.tsx` (`"use client"`), props
`{ tournamentId, rodada, titulo, texto }`. Botão verde (`bg-green-700` como o atalho de
convocação) + ícone (lucide `Share2`/`MessageCircle`). `useTransition`/estado `pendente`.
Fluxo:
```
1. fetch(`/dashboard/torneios/${id}/rodada/${rodada}/imagem`, {credentials:"same-origin"})
   → blob → File("rodada-N.png", image/png)  (se falhar, segue só com texto)
2. dados = file && navigator.canShare?.({files:[file]})
     ? { files:[file], text, title }
     : { text, title }
3. se navigator.share && canShare(dados): try await share(dados) catch AbortError→nada / outro→fallback
   senão fallback()
fallback(): // a aba do wa.me é aberta ANTES dos awaits (popup-blocker bloqueia window.open
            // após await no desktop): const win = window.open("about:blank","_blank","noopener")
            // ...então clipboard.writeText(texto)+toast; se file → download;
            // por fim: if (win) win.location = `https://wa.me/?text=${enc(texto)}`
```
`title = "{titulo} — Rodada {rodada}"`. Detalhe crítico: no desktop o fallback é o caminho
REAL (navegadores desktop quase nunca compartilham arquivo), então o `window.open` precisa
ser disparado de dentro do gesto do clique (antes de qualquer `await`), senão o popup é
bloqueado silenciosamente.

### D8 — Inserção: seção "Liberação de rodadas" (page.tsx), por rodada liberada
**Decisão de produto confirmada com o dono (AskUserQuestion 2026-06-14):** compartilhar é
**sempre por-rodada com imagem** (não há caminho "liberar tudo/fase de grupos ⇒ só texto").
Isso revisa a decisão anterior; o dono escolheu a simplicidade de uma imagem por rodada.
Na `SecaoTorneio "Liberação de rodadas"` (já gated `ehDono && ehGerado &&
rodadasLiberacao.length>0`), abaixo de `LiberarRodadasButtons`, renderizar um
`CompartilharRodadaButton` por rodada **liberada** (`rodadasLiberacao.filter(r=>r.liberada)`).
O `texto` de cada rodada é montado no server via `mensagemRodada` a partir das partidas
daquela rodada (já carregadas). Só dono, só formato gerado (o gate da seção já cobre).

## Edge cases / gotchas

- **Satori sem `next/image`/grid/oklch**: só flexbox + hex. Monograma inline; escudos como
  data URL. Confirmado que as cores são hex (CHECK no banco).
- **Rodada de grupos**: "rodada N" agrupa todos os grupos → a imagem lista todos os
  confrontos da rodada N (pode ser longa; layout em coluna com wrap/limite). Knockout:
  rodada = fase. Ambos cabem no mesmo render (lista de confrontos).
- **Partidas encerradas na rodada**: a imagem (via `getPartidasDaRodada`) traz TODAS as da
  rodada; a legenda usa abertas+encerradas da page. Numa rodada recém-liberada o normal é
  estarem todas a iniciar.
- **`wa.me` da lista vs 1-a-1**: a lista da rodada NÃO tem destinatário único → o fallback
  usa `https://wa.me/?text=` (sem número, abre o seletor), não `linkWhatsApp` (que aponta a
  um número). Não forçar `linkWhatsApp` aqui.
- **Web Share desktop**: navegadores desktop normalmente NÃO suportam `share` com arquivos
  → o fallback é o caminho REAL no desktop, não exceção. `canShare({files})` é a checagem
  correta (não basta `"share" in navigator`).
- **PII**: celular só `authenticated` (RLS users). O dono é authenticated; o texto é montado
  no server e o número entra SÓ embutido no `wa.me` de cada comandante (decisão do dono —
  ele aceitou expor os telefones no grupo); o número cru nunca vai como prop separada.
- **Custo**: a imagem é gerada SOB DEMANDA (no clique). A legenda usa dados já carregados
  (zero query extra na page). `getPartidasDaRodada` roda só quando a imagem é pedida.
- **CSP/proxy**: a rota vive sob `/dashboard` → auth-gated (bom) e CSP não afeta um PNG.
- **Pré-open SEM `noopener`**: `window.open(...,"noopener")` retorna `null` (por spec), o que
  perderia a referência da aba pré-aberta no desktop. O pré-open é `window.open("about:blank",
  "_blank")` (sem noopener) + `janela.opener = null` à mão — mantém a referência para
  redirecionar a aba ao `wa.me` dentro do gesto do clique (senão o popup é bloqueado).
- **Imagem = teaser; texto = completo**: a imagem corta em `MAX_LINHAS` (12) com "+N
  confrontos" (rodada de grupos grande); o texto lista todos. Decisão consciente: a imagem é
  o destaque visual, o texto é a lista canônica.
- **❌ só no texto**: lado órfão (clube sem técnico) aparece "(❌)" no texto; na imagem é
  desenhado normalmente (escudo/monograma) — a imagem é o confronto, não o status de
  comandante. Assimetria consciente.

## Plano de testes

- **Unit** `getPartidasDaRodada`: monta o select certo (eq tournament_id + rodada), resolve
  nome (`team?.nome ?? rotulo`), `escudoUrl`, `porNome` (team null); ordena confrontos.
- **Unit** `mensagemRodada`: linha por confronto, comandante vs ❌, header "Nª rodada", URL
  absoluta, sem emoji; fallbacks de título/nome.
- **Unit** (componente) `CompartilharRodadaButton`: usa `navigator.share` quando
  `canShare({files})` true; cai no fallback (clipboard + open `wa.me/?text=`) quando não;
  `AbortError` não emite toast de erro. (mockar navigator.)
- **Unit** (rota): a rota nega não-dono (404). Render do `ImageResponse` é difícil de
  asserir em unit — cobrir a lógica de montar confrontos/cores num helper puro testável
  (`montarConfrontosDaRodada`/escolha de monograma) e validar a imagem AO VIVO.
- **Ao vivo (LOCAL, 390px, conta de teste)**: liberar uma rodada → botão "Compartilhar"
  aparece (dono) → abrir a rota da imagem no browser e conferir o PNG (confrontos + cores +
  monograma p/ por-nome) → no desktop, conferir o fallback (texto copiado + download + wa.me
  abre) → não-dono não vê o botão e a rota nega.

## Rollout

0. **`next.config.ts` — `outputFileTracingIncludes`**: adicionar PROATIVAMENTE a rota nova
   (`'/dashboard/torneios/[id]/rodada/[rodada]/imagem': ['./src/features/og/fonts/**',
   './src/app/icon.svg']`), espelhando as entradas de OG. A rota é dinâmica e usa
   `readFile(process.cwd())` via `carregarAssets` — sem o include o build passa mas a imagem
   quebra com ENOENT em runtime no Vercel (invisível aos gates e ao dev local). Validar com
   `next build && next start` batendo a rota.
1. Refactor `brand.tsx` (export `carregarAssets`) + `rodada.tsx` (render) + rota de imagem.
2. `getPartidasDaRodada` + `mensagemRodada` + `CompartilharRodadaButton` + inserção na page.
3. Testes; gates (typecheck/lint/test/build).
4. Review adversarial por workflow; corrigir HIGH/CRITICAL.
5. Validação ao vivo no LOCAL (imagem + share + gate).
6. **Sem DDL** → sem MCP. Commit pt-BR (sem coautoria) + push; `openspec archive`.
