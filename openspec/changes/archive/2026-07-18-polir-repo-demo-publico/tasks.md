## 1. Documentação do repositório público

- [ ] 1.1 Reescrever `README.md` em pt-BR (sem emojis, sem menção a IA): o que é o Goliseu,
  stack real (lida de `package.json`), arquitetura (RSC-first, `src/features/<dominio>`,
  Server Actions em `src/actions`, `supabase/schema.sql` como fonte de verdade, RLS + posse),
  como rodar dev (`pnpm dev` / `docker compose up` / Supabase local), variáveis de ambiente,
  scripts (`dev`/`build`/`test`/`test:rls`/`lint`/`typecheck`) e licença.
- [ ] 1.2 Documentar a licença: como NÃO há arquivo `LICENSE`, registrar "Todos os direitos
  reservados / código proprietário" no README e emitir `BLOCKED-F2` para o dono decidir
  (proprietário vs. open-source). NÃO inventar uma licença open-source.
- [ ] 1.3 Conferir `.env.example` contra `grep -rn "process.env" src/`: garantir que enumera
  todas as chaves de runtime, `NEXT_PUBLIC_*` separadas das server-side, sem valores.

## 2. Higiene de dependências

- [ ] 2.1 `pnpm remove -D playwright` — remover a devDep órfã (sem config/suíte/script E2E),
  atualizando `package.json` e o lockfile. NÃO adicionar suíte E2E.

## 3. Gating de perfil consistente na demo

- [ ] 3.1 `DemoTorneiosLista.tsx`: importar/usar `usePerfilFlags()`; esconder "Criar torneio",
  "Editar", "Excluir" e o select "Mudar status" quando `!flags.podeGerir` (espelhando
  `DemoLigaView`).
- [ ] 3.2 `CardVitrineDemo.tsx`: tornar `onToggleListar` opcional; quando ausente, não renderizar
  o botão de toggle (card read-only).
- [ ] 3.3 `DemoExplorar.tsx`: usar `usePerfilFlags()` e passar `onToggleListar` só quando
  `flags.podeGerir` (visitante/técnico não veem o toggle "listar").
- [ ] 3.4 Não alterar `DemoLigaView`/`DemoCopaView` (já corretos).

## 4. Verificação

- [ ] 4.1 `pnpm typecheck` verde.
- [ ] 4.2 `pnpm lint` verde (o override de isolamento da demo continua satisfeito).
- [ ] 4.3 `pnpm test` verde nos arquivos tocados/afetados da demo.
