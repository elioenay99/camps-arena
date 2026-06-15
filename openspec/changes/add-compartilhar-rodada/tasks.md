# Tasks — add-compartilhar-rodada

Sem DDL (tudo derivado). Gates: typecheck/lint/test/build + review adversarial por workflow
antes de commitar. Validação ao vivo no Supabase LOCAL (390px, conta de teste). Dev contra
o LOCAL (env de shell vence o `.env.local`).

## 1. Infra de imagem (Satori/next-og)
- [ ] 1.1 Refatorar `src/features/og/brand.tsx`: `export` de `carregarAssets()` (fontes +
  logo) sem mudar o comportamento do brand estático.
- [ ] 1.2 `src/features/og/rodada.tsx`: `renderRodadaOg({ titulo, rodada, confrontos, cores })`
  → `ImageResponse` 1080×1080. Flexbox-only, hex. Cabeçalho (marca + "Nª RODADA") + lista de
  confrontos (escudo data-URL OU monograma inline) × (idem). Cores do campeonato com fallback
  tema base; texto via `onColor`.
- [ ] 1.3 Helper interno: escudo `escudoUrl → dataURL` via `fetch(url,{signal:
  AbortSignal.timeout(2000)})` em paralelo (`Promise.all`) + try/catch (trata `AbortError`);
  `monograma(nome)` (inicial + `corDoNome` replicado inline). Falha/timeout/ausência ⇒
  monograma. Lado vazio (bye/TBD) ⇒ placeholder neutro (não monograma "A").

## 2. Rota de imagem (Route Handler)
- [ ] 2.1 `app/dashboard/torneios/[id]/rodada/[rodada]/imagem/route.tsx` (GET): `createClient`
  server + `auth.getUser`; posse por `.select("id, titulo, cor_primaria, cor_secundaria")
  .eq("id",id).eq("created_by", user.id).maybeSingle()` (1 viagem, alimenta cores+título) →
  `new NextResponse(null,{status:404})` se não-dono (NÃO `notFound()` — é route handler).
- [ ] 2.2 Carrega confrontos via `getPartidasDaRodada` + cores via `resolverCoresTorneio`
  (passando o `torneio` já carregado); chama `renderRodadaOg`; devolve o `ImageResponse`.
- [ ] 2.3 **Adicionar a rota ao `outputFileTracingIncludes` do `next.config.ts`**
  (`'/dashboard/torneios/[id]/rodada/[rodada]/imagem': ['./src/features/og/fonts/**',
  './src/app/icon.svg']`), espelhando o OG — a rota é dinâmica + `readFile(process.cwd())`;
  sem isso quebra em runtime (ENOENT) apesar do build verde. Validar com `next build`+`start`.

## 3. Dados + texto
- [ ] 3.1 `src/features/match/data/getPartidasDaRodada.ts`: select `matches` por
  `tournament_id`+`rodada` com embed `v1/v2 → team{nome,escudo_url}+rotulo`; devolve por lado
  `{ nome, escudoUrl|null, porNome }`; ordena por posicao/perna/created_at. **Pular byes/lados
  vazios** (vaga nula → não vira "A definir"/monograma). **Dedup ida-e-volta**: quando
  `perna != null`, uma linha por par (as 2 pernas compartilham `rodada`; rótulo "ida e volta").
- [ ] 3.2 `mensagemRodada(...)` em `src/lib/whatsapp.ts` (fonte única, sem emoji decorativo,
  URL absoluta): cabeçalho + linha por confronto (nome + comandante **e `wa.me` via
  `linkWhatsApp(celular)`**, ou ❌ se sem comandante) + "Acompanhe: {url}". Fallbacks de
  título/nome. Encerradas (sem contato) saem só com nomes.

## 4. UI (mobile-first, sonner)
- [ ] 4.1 `CompartilharRodadaButton` (client, `src/features/match/components/`): Web Share
  (`canShare({files})` → `share`), fallback desktop (clipboard + download PNG + `wa.me/?text=`),
  `AbortError` silencioso. **`window.open` do `wa.me` ANTES dos `await`** (popup-blocker bloqueia
  após await no desktop): `const win = window.open("about:blank","_blank","noopener")` →
  awaits → `if (win) win.location = waUrl`. Botão verde + ícone. Props `{tournamentId, rodada,
  titulo, texto}`.
- [ ] 4.2 `app/dashboard/torneios/[id]/page.tsx`: na seção "Liberação de rodadas", abaixo de
  `LiberarRodadasButtons`, um `CompartilharRodadaButton` por rodada LIBERADA
  (`rodadasLiberacao.filter(r=>r.liberada)`), com `texto` montado no server via `mensagemRodada`
  a partir das partidas **mescladas (`partidasAbertas` + `partidasEncerradas`) filtradas por
  `r.rodada`** (para casar com a imagem). Gate herdado (ehDono && ehGerado).

## 5. Testes
- [ ] 5.1 `getPartidasDaRodada`: select certo; nome (`team?.nome ?? rotulo`); `porNome`;
  `escudoUrl`; **dedup ida-e-volta** (perna 1+2 do mesmo par → 1 confronto); **bye/lado vazio
  pulado**.
- [ ] 5.2 `mensagemRodada`: linha por confronto, comandante **+ wa.me** vs ❌, header, URL
  absoluta, sem emoji decorativo, fallbacks; encerrada sai sem wa.me.
- [ ] 5.3 `CompartilharRodadaButton`: share quando `canShare({files})`; fallback quando não
  (clipboard + open wa.me); `AbortError` não vira erro de toast.
- [ ] 5.4 Rota de imagem: nega não-dono (404). Lógica pura de confrontos/monograma testada à
  parte (o ImageResponse valida-se ao vivo).

## 6. Gates + review + validação
- [ ] 6.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (`${PIPESTATUS[0]}`).
- [ ] 6.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.
- [ ] 6.3 Validação ao vivo (LOCAL, 390px, conta de teste): liberar rodada → botão aparece
  (dono) → abrir a rota da imagem e conferir o PNG (confrontos + cores + monograma por-nome)
  → fallback desktop (texto copiado + download + wa.me) → não-dono não vê o botão / rota nega.

## 7. Encerramento
- [ ] 7.1 Commit pt-BR (sem coautoria) + push. (Sem DDL → sem MCP.)
- [ ] 7.2 `openspec archive add-compartilhar-rodada`; atualizar memória de retomada.
