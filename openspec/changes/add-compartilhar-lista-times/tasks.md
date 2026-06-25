# Tasks — add-compartilhar-lista-times

## 1. Texto (lib)
- [x] 1.1 Adicionar `TimeListaTexto` + `mensagemListaTimes({ titulo, times, tournamentId })`
      em `src/lib/whatsapp.ts` (reusa `linkWhatsApp`; ❌ só sem comandante; rodapé `Veja:`).
- [x] 1.2 Testes em `src/lib/whatsapp.test.ts`: técnico com celular (`nome: wa.me`), técnico
      sem celular (só nome), sem técnico (❌), título vazio (fallback), rodapé com a URL.

## 2. Componente client
- [x] 2.1 `src/features/tournament/components/CompartilharListaTimesButton.tsx`: Web Share no
      celular (`{ text, title }`, sem files), fallback desktop (copiar + `wa.me/?text=`),
      `AbortError` ignorado, toasts (sonner), botão verde + ícone (padrão do repo).
- [x] 2.2 Teste `CompartilharListaTimesButton.test.tsx`: caminho celular (`navigator.share`),
      caminho desktop (pré-open + `clipboard.writeText` + `wa.me/?text=`), cancelar sem erro.

## 3. Wiring (RSC)
- [x] 3.1 `VagasSection`: prop opcional `compartilhar?: { titulo; texto }`; renderiza o botão
      no cabeçalho (ao lado de "Vagas") quando presente.
- [x] 3.2 `app/dashboard/torneios/[id]/page.tsx`: quando `moderar && ehGerado &&
      vagas.length > 0`, `carregarCelulares` dos técnicos das vagas, montar
      `mensagemListaTimes` e passar à `VagasSection`.

## 4. Gates de qualidade
- [x] 4.1 `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` verdes.
- [x] 4.2 Revisão adversarial por workflow no diff (0 must_fix antes de commitar).
- [x] 4.3 Validação ao vivo (390px): botão aparece, share/copy funciona, ❌ e links corretos.

## 5. Fechamento
- [ ] 5.1 Commit pt-BR (Conventional Commits, sem coautoria de IA) + push.
- [ ] 5.2 `openspec archive add-compartilhar-lista-times`.
- [ ] 5.3 Derrubar stack local (`docker compose down` + `npx supabase stop` se subiram).
