## 1. Primitivo compartilhado

- [x] 1.1 Criar `src/components/ui/select-native.tsx` — `<select>` espelhando o `Input`
      (`h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base
      md:h-8 md:text-sm`), com os mesmos anéis de foco e estados `disabled`/`aria-invalid`,
      `data-slot="select-native"` e `className` sobrescrevível via `cn()`.
- [x] 1.2 Criar `src/components/ui/select-native.test.tsx` — fonte mobile `text-base`,
      densidade `md:text-sm`/`md:h-8` preservada, alvo `h-11` no mobile, `className` da
      chamada vencendo o padrão, props nativas (`value`/`onChange`/`disabled`) repassadas.

## 2. Migração dos `<select>` (zoom do iOS)

- [x] 2.1 `LeagueWizard.tsx` — apagar a `SELECT_CLASSE` (`:146`) e as duas cópias inline
      (`:1469`, `:1491`); os 8 dropdowns passam a `SelectNative` (desktop já era `h-8`, sem
      override).
- [x] 2.2 `CupWizard.tsx` — apagar a `SELECT_CLASSE` (`:39`); 4 selects → `SelectNative`
      com `className="md:h-9"`.
- [x] 2.3 `RuleListEditor.tsx` — apagar a `SELECT_CLASSE` (`:38`); 4 selects →
      `SelectNative` com `className="md:h-9"`.
- [x] 2.4 `MatchCreateForm.tsx` — apagar a `selectClassName` (`:15`); 2 selects →
      `SelectNative` com `className="md:h-9"`.
- [x] 2.5 `AddMemberSearch.tsx` — apagar a `selectClassName` (`:18`); select →
      `SelectNative` com `className="md:h-10"`.
- [x] 2.6 `IniciarGruposPanel.tsx` (`:194`, `:302`) e `IniciarMataMataPanel.tsx` (`:192`,
      `:201`) → `SelectNative` com `className="md:h-9"` (no mata-mata preservar o
      `min-w-0`, que é o que segura os dois selects na mesma linha do "×").
- [x] 2.7 `competidor/ConfrontoDiretoPanel.tsx:66` e `tecnico/ConfrontoTecnicosPanel.tsx:67`
      → `SelectNative` com `className="md:h-10"`.
- [x] 2.8 Demonstração pública — `DemoExplorar.tsx` (`:86`, `:96`, `:107`),
      `DemoTorneiosLista.tsx` (`:93`, `:240`, `:259`) e
      `adapters/DemoConfrontoDiretoPanel.tsx:72` → `SelectNative` com `className="md:h-9"`.
      Confirmar que o guard de isolamento continua verde (`isolamento.test.ts`): o import é
      de `@/components/ui/*`, categoria não barrada pelo `eslint.config.mjs:22-54`.

## 3. Campos de geometria própria (só o bump de fonte)

- [x] 3.1 `RoundPager.tsx:73` — `text-sm` → `text-base md:text-sm`, mantendo
      `appearance-none`, `pr-8`, `min-h-11 md:min-h-0` e o `ChevronDown` sobreposto.
- [x] 3.2 `DemoPerfilSelector.tsx:26` — `text-xs` → `text-base md:text-xs` e `h-7` →
      `h-9 md:h-7` (28px não contém fonte de 16px).
- [x] 3.3 `PropostasPendentes.tsx:129` (`<textarea>`) — `text-sm` → `text-base md:text-sm`.
- [x] 3.5 `ArtilheirosEncerrada.tsx:283` e `MatchScoreModal.tsx:453` (achados na varredura
      5.1, fora da lista original) — campo de texto do AUTOR DO GOL, digitação real no
      modal mais usado do app: `text-sm` → `text-base md:text-sm`, altura já correta.
- [x] 3.4 `color-field.tsx:69` (campo HEX) — `text-sm` → `text-base md:text-sm`. O
      `<input type="color">` de `:54` NÃO muda (não recebe digitação). Cobrir em
      `color-field.test.tsx`.

## 4. Fallback do escudo (`TeamCrest`)

- [x] 4.1 Registrar no `design.md` o veredito da hipótese da hidratação: **REFUTADA** — o
      `next/image` 16.2.6 já reatribui `img.src` no mount justamente para reemitir o
      `error` perdido (`image-component.js:140-145`), e o `onError` do `TeamCrest` chega
      intacto até lá.
- [x] 4.2 `TeamCrest.tsx` — defesa em profundidade: `ref` que no mount checa
      `img.complete && img.naturalWidth === 0` (terminou e falhou) e cai no mesmo estado de
      erro, sem depender de o evento ter sido ouvido.
- [x] 4.3 `TeamCrest.tsx` — resetar `erro` quando `escudoUrl` mudar, via ajuste de estado
      **durante o render** (guardar a URL que produziu o erro e comparar), não `useEffect`
      — evita o render intermediário com o estado velho.
- [x] 4.4 `TeamCrest.test.tsx` — **inverter** o caso "estado preso" (`:74-84`): a troca de
      `escudoUrl` depois de um erro agora SHALL voltar a tentar a imagem.
- [x] 4.5 `TeamCrest.test.tsx` — novo caso: imagem que já falhou antes do mount
      (`complete = true`, `naturalWidth = 0` via `Object.defineProperty` no mock de
      `next/image`) cai nas iniciais sem nenhum evento `error` disparado.
- [x] 4.6 `TeamCrest.test.tsx` — caso de não-regressão: imagem boa
      (`complete = true`, `naturalWidth = 64`) NÃO cai no fallback.

## 5. Varredura e gate

- [x] 5.1 Revarrer `grep -rn '<input\|<select\|<textarea' src --include='*.tsx'` cruzando
      com `text-sm`/`text-xs` e confirmar que sobrou zero campo editável abaixo de 16px no
      mobile. Reportar que o `Input` base (`input.tsx:11`) já estava correto.
- [x] 5.2 Gate LEVE (máquina de 16 GB — sem browser, sem suíte completa, sem `build`):
      `pnpm typecheck`, `pnpm lint` e subset afetado com `--maxWorkers=2`. Colar a saída
      real.
- [x] 5.3 `openspec validate mobile-zoom-ios-escudo-fallback --strict` = valid.
- [x] 5.4 Commit pt-BR, Conventional Commits, subject ≤72 chars, sem coautoria de IA.
      **Sem push** (fica com o orquestrador).
- [x] 5.5 Reportar ao orquestrador o que ficou fora do alcance: confirmar se a URL do
      escudo do print está de fato quebrada no Storage exige consulta a banco/Storage,
      proibida para este agente. E que a validação visual a 390px é dele.
