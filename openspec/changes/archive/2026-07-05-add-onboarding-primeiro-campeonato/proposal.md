## Why

Uma conta recém-criada cai em `/dashboard` sem nenhuma partida ativa e vê o
estado-vazio `EmptyActiveMatches` (`src/features/match/components/EmptyActiveMatches.tsx`),
que hoje exibe o microcopy neutro "Nenhuma partida ativa" + DOIS CTAs de peso igual:
**"Nova partida"** (`/dashboard/partidas/nova`) e **"Criar torneio"**
(`/dashboard/torneios/novo`). O problema: "Nova partida" só produz valor quando o
usuário JÁ tem um torneio AVULSO aberto — o seletor `/dashboard/partidas/nova` lista os
avulsos elegíveis e, sem nenhum, apenas orienta a criar um torneio primeiro. Para quem
acabou de chegar (zero torneios), esse CTA é um **beco sem saída**: o primeiro clique de
maior destaque leva a uma tela que só diz "crie um torneio antes".

Isto é caro no momento mais frágil da jornada — o primeiro minuto. Em vez de um caminho
único e óbvio até o valor, o novo usuário encara duas portas de peso visual idêntico,
uma delas fechada. O objetivo desta change é simples: **o primeiro clique SEMPRE leva a
valor**. Quem não tem nada é conduzido, com boas-vindas e um único CTA primário, direto
a montar o primeiro campeonato; quem já tem torneios (mas nenhum avulso aberto) não vê
mais o beco; e quem tem avulso aberto mantém o fluxo atual intacto.

## What Changes

- **Estado-vazio de partidas ativas vira ciente de contexto (3 estados).** O
  `EmptyActiveMatches` passa a receber props (`semTorneios: boolean`,
  `temAvulsoAberto: boolean`) e ramifica em três estados, em vez do bloco fixo de dois
  CTAs iguais de hoje:
  1. **SEM NENHUM torneio** (`semTorneios === true`): esconde os dois CTAs atuais e
     mostra copy de BOAS-VINDAS orientada à ação (headline acolhedora + uma linha curta
     dizendo que monta em 1 minuto) e UM único CTA primário com o texto EXATO
     **"Criar meu primeiro campeonato — leva 1 minuto"** → `/dashboard/torneios/novo`.
     "Nova partida" NÃO aparece aqui (seria beco).
  2. **TEM torneio(s) mas NENHUM avulso aberto** (`semTorneios === false &&
     temAvulsoAberto === false`): mantém "Nenhuma partida ativa" (não é usuário novo),
     NÃO mostra "Nova partida" (seria beco), mostra "Criar torneio" e um link discreto
     "Ver meus torneios" → `/dashboard/torneios`.
  3. **TEM avulso aberto** (`temAvulsoAberto === true`): comportamento ATUAL — "Nova
     partida" (primária) + "Criar torneio".
- **A página do dashboard passa a computar os dois flags no servidor.** `src/app/dashboard/page.tsx`
  (Server Component) busca, além das partidas, os torneios do usuário para derivar
  `semTorneios` e `temAvulsoAberto`, e os repassa como props ao `EmptyActiveMatches`.
  Reusa os data-fetchers existentes: `getMeusTorneios(user.id)` → `{ organizo, participo }`
  (mesmo padrão de "sem torneios" já usado em `src/app/dashboard/torneios/page.tsx`) e
  `getOwnTournaments(user.id)` → avulsos abertos do dono (`length > 0` = `temAvulsoAberto`).
  As buscas de torneios só são necessárias quando não há partida ativa (o único ramo que
  renderiza o estado-vazio).

## Capabilities

### Modified Capabilities
- `dashboard`: o estado-vazio de partidas ativas do painel deixa de oferecer dois CTAs
  de peso igual e passa a ramificar em três estados conforme o contexto do usuário
  (sem torneios / com torneios mas sem avulso aberto / com avulso aberto), garantindo
  que o primeiro clique de um novo usuário sempre leve a valor.

## Impact

- **Banco de dados:** NENHUM. Zero DDL, zero migração. Reusa `getMeusTorneios` e
  `getOwnTournaments`, ambos já existentes (leitura via RLS existente).
- **Código de aplicação (frontend puro):**
  - `src/app/dashboard/page.tsx` — no ramo `partidas.length === 0`, buscar os torneios do
    usuário, derivar `semTorneios`/`temAvulsoAberto` e passar como props ao
    `EmptyActiveMatches`. Permanece Server Component (RSC-first); nenhum `"use client"`
    novo.
  - `src/features/match/components/EmptyActiveMatches.tsx` — aceitar as props e ramificar
    nos 3 estados, reusando `Button` `rounded-full`, ícones `lucide-react` e `Link` do
    next já em uso. Preservar a11y (ícones `aria-hidden`, `:focus-visible`, alvo de toque
    ≥44px no mobile).
- **Acessibilidade/tema/i18n:** pt-BR em toda a copy nova; tema dark/light preservado
  (tokens semânticos, sem cor hardcoded); ícones decorativos `aria-hidden`.
- **Testes:** cobrir os 3 estados de ramificação do `EmptyActiveMatches` (é lógica real,
  não over-engineering) — teste novo, já que hoje não há teste do estado-vazio.

## Fora de escopo (follow-up)

- **Onboarding guiado multi-passo / tour do produto.** Esta change só corrige o primeiro
  clique do estado-vazio; não introduz wizard, checklist de progresso nem tooltips.
- **Mudança nos data-fetchers.** `getMeusTorneios` e `getOwnTournaments` são reusados
  como estão; nenhuma nova query ou coluna.
