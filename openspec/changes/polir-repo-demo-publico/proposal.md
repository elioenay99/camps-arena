## Why

O repositório do Goliseu virou **público** (`elioenay99/camps-arena`), mas ainda carrega
resíduos de scaffolding que enfraquecem a primeira impressão e a experiência de quem clona:

1. **README boilerplate.** O `README.md` é o texto literal do `create-next-app` — não diz o
   que o projeto é, qual a stack real, como rodar, nem quais variáveis de ambiente existem.
   Num repo público isso é a porta de entrada e hoje ela não comunica nada.
2. **Gating de perfil inconsistente na demo.** A demonstração pública `/demo` (sandbox 100%
   em memória) já tem um seletor de perfil fictício onde "Visitante" é read-only
   (flag `podeGerir=false`). `DemoLigaView`/`DemoCopaView` respeitam isso, mas
   `DemoTorneiosLista` e `DemoExplorar` ignoram: mostram Criar/Editar/Excluir torneio,
   mudar status e o toggle "listar" mesmo para um visitante. Não há risco de segurança
   (nada persiste), mas é uma inconsistência de UX numa vitrine pública.
3. **devDependency órfã.** `package.json` traz `playwright` em devDependencies sem nenhuma
   config, suíte ou script E2E que a use. É peso morto que confunde quem lê o repo.

Esta change é **polimento de repositório público**: documentação honesta, consistência de
UX na demo e higiene de dependências. É **ZERO-DDL**, não toca banco, Server Actions,
Realtime nem qualquer rota privada, e não altera o comportamento de produção — só a demo
(visibilidade de controles), a documentação e o `package.json`/lockfile.

**Decisão de escopo (travada):** NÃO adicionar suíte E2E (fora de escopo — a cobertura já é
robusta com ~100 `.test.ts` + pgTAP de RLS); a devDep `playwright` é **removida**, não
substituída.

**Pendência de decisão do dono:** o repositório não tem arquivo `LICENSE`. Sem instrução
explícita, o README documenta o código como **proprietário ("Todos os direitos
reservados")** — o default seguro e reversível para um repo sem licença declarada. A
escolha final (proprietário vs. uma licença open-source) é decisão do dono e está
registrada como bloqueio (`BLOCKED-F2`) para confirmação; trocar depois é um ajuste de
uma linha no README + adicionar o arquivo `LICENSE`.

## What Changes

- **README de verdade (pt-BR).** Reescreve `README.md` do zero cobrindo, com base nos fatos
  do código: o que é o Goliseu (gestor de campeonatos amadores de futebol de videogame —
  ligas/pirâmide de divisões, copas, torneios avulsos, artilharia, técnicos/carreira, hall
  da fama), a stack real (lida do `package.json`), a arquitetura (RSC-first,
  `src/features/<dominio>`, mutações via Server Actions em `src/actions`,
  `supabase/schema.sql` como fonte de verdade do banco, RLS estrito + checagem de posse),
  como rodar em dev (`pnpm dev` / `docker compose up` / Supabase local), as variáveis de
  ambiente, os scripts de `package.json` e a licença. Sem emojis, sem menção a IA.
- **`.env.example` conferido** contra o uso real (`grep process.env`), garantindo que
  enumera todas as chaves de runtime lidas pelo app, separando `NEXT_PUBLIC_*` (client) das
  server-side, sem valores reais.
- **Gating de perfil consistente na demo.** `DemoTorneiosLista` passa a usar
  `usePerfilFlags()` e esconde Criar torneio, Editar, Excluir e o select "Mudar status"
  quando `!podeGerir`. `DemoExplorar` esconde o toggle "listar" por card quando
  `!podeGerir` (o card vira read-only via `onToggleListar` opcional em `CardVitrineDemo`).
  Espelha exatamente o padrão já usado por `DemoLigaView`/`DemoCopaView`. Liga/Copa não
  mudam.
- **Remoção da devDep órfã `playwright`** (`pnpm remove -D playwright`), atualizando
  `package.json` e o lockfile. Nenhuma suíte E2E é adicionada.

## Impact

- **Specs:** MODIFIED `public-demo` (o gate de perfil fictício vale de forma consistente em
  todas as telas da demo, incluindo Torneios e Explorar). ADDED `public-repo` (nova
  capability: documentação e higiene do repositório público).
- **Código (alterado):** `README.md`, `.env.example` (se divergente), `package.json` +
  lockfile (remoção do playwright), `src/features/demo/components/DemoTorneiosLista.tsx`,
  `src/features/demo/components/DemoExplorar.tsx`,
  `src/features/demo/components/CardVitrineDemo.tsx` (`onToggleListar` opcional).
- **Intocados:** banco, Server Actions, Realtime, rotas privadas, `middleware.ts`,
  `proxy.ts`, o guard de isolamento da demo, `DemoLigaView`/`DemoCopaView`.
- **Risco:** baixo — documentação, visibilidade de controles numa sandbox sem persistência
  e remoção de dependência não usada. Nenhuma superfície de produção muda de comportamento.
