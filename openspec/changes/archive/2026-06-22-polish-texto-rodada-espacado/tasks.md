## 1. Implementação

- [x] 1.1 `src/lib/whatsapp.ts` (`mensagemRodada`): unir os confrontos por `\n\n` (linha em branco) em vez de `\n`.
- [x] 1.2 Cabeçalho passa a `"${t} — ${rodada}a rodada Liberada"`.
- [x] 1.3 Atualizar o JSDoc da função (separação por linha em branco + sufixo "Liberada").

## 2. Testes

- [x] 2.1 `whatsapp.test.ts`: atualizar os cabeçalhos esperados para "…a rodada Liberada".
- [x] 2.2 Adicionar teste com MÚLTIPLOS confrontos travando a linha em branco entre eles (`\n\n`). (+ fixture do CompartilharRodadaButton atualizado)

## 3. Gates de qualidade

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes. (1194 testes)
- [x] 3.2 Revisão adversarial (workflow 2 lentes + juiz) — veredito `aprovado`, 0 `must_fix`. Confirmado: sem `\n\n\n`, botão só aparece em rodada liberada (cabeçalho "Liberada" sempre verdadeiro), consumidor trata o texto como string opaca.
- [x] 3.3 Validação: teste de string exata trava a saída para uma rodada multi-confronto (cabeçalho "Liberada" + `\n\n` entre blocos + `wa.me`), batendo com o formato pedido pelo dono.

## 4. Arquivar

- [x] 4.1 `openspec archive polish-texto-rodada-espacado`; commit (pt-BR, sem coautoria); push; derrubar Docker.

## Follow-up (não-bloqueante, decisão do dono)

- A imagem OG da rodada (`rodada.tsx`) mostra "Nª RODADA", sem "Liberada". O dono pediu só o TEXTO;
  o PNG ficou inalterado. Se quiser "LIBERADA" também no PNG, é um ajuste separado.
