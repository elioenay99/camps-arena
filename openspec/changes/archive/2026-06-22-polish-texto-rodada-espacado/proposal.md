## Why

O texto de anúncio da rodada (`mensagemRodada`, `src/lib/whatsapp.ts`) lista os confrontos em
linhas CONSECUTIVAS (join por `\n` simples). Numa rodada cheia (um Brasileirão tem 10 jogos) o
bloco vira um "paredão" de linhas grudadas, difícil de ler no WhatsApp. O dono pediu o texto mais
**espaçado** — uma linha em branco entre cada confronto — e que o cabeçalho deixe explícito que a
rodada foi **liberada**.

## What Changes

- **Espaçamento**: cada confronto passa a ser separado por uma **linha em branco** (`\n\n`), igual
  à separação que já existe entre cabeçalho/corpo e corpo/rodapé. O texto fica "respirado".
- **Cabeçalho**: passa de `"{título} — Nª rodada"` para `"{título} — Nª rodada Liberada"` (decisão
  de produto do dono — o anúncio é sempre de uma rodada liberada).
- Nada mais muda: `wa.me` por comandante, marca ❌ para vaga sem técnico, fallback de título e a URL
  "Acompanhe:" no rodapé seguem idênticos.

## Capabilities

### Modified Capabilities

- **match-engagement**: o requisito "Texto do anúncio da rodada" passa a especificar a separação por
  **linha em branco** entre confrontos e o sufixo **"Liberada"** no cabeçalho.

## Impact

- **Sem DDL.** Mudança contida em `src/lib/whatsapp.ts` (`mensagemRodada`: separador `\n` → `\n\n` e
  sufixo no cabeçalho) + ajuste dos testes de `whatsapp.test.ts`.
- **Compatibilidade**: a imagem da rodada, a rota OG, o componente de compartilhar e os links `wa.me`
  não mudam. Apenas o corpo de texto fica mais legível.
