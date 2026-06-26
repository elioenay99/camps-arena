# Design — add-torneio-abas-passador

## Princípio: dados + gating na RSC; abas/passador só apresentam

A `page.tsx` permanece a única que CARREGA dados, computa capacidades (gerir/arbitrar/moderar) e
aplica os gates por papel/formato. Os componentes novos (`TournamentTabs`, `RoundPager`) são
client e recebem **nós já renderizados** — nunca dados crus, nunca PII. Assim:

- Uma aba/seção que o usuário não pode ver **não é renderizada** na RSC ⇒ nem chega ao client.
- O celular (PII) só existe embutido no `href` do `wa.me` montado no servidor.

## Abas

### `src/components/ui/tabs.tsx` (base, sobre `@radix-ui/react-tabs`)
Wrapper shadcn-style: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` com as classes do design
system (Dracula/Canarinho). `TabsList` rolável horizontalmente no mobile (overflow-x-auto,
sem quebrar em 390px). Trigger ativo com sublinhado/realce na cor primária do tema.

### `src/features/tournament/components/TournamentTabs.tsx` (client)
```tsx
"use client"
type Aba = { value: string; label: string; content: ReactNode }
function TournamentTabs({ abas, padrao }: { abas: Aba[]; padrao: string }) {
  // Radix Tabs controla o estado; troca instantânea (sem navegação/refetch).
  // Default unmount do TabsContent inativo é OK — o nó volta do payload já presente.
}
```
- A `page.tsx` monta `const abas = [...]` incluindo só as que têm conteúdo:
  - **Classificação**: classificação por pontos / chave (mata) / grupos+chave + (clubes); ou o
    `AvisoAguardandoLiberacao` para não-dono. SEMPRE presente (mostra empty-state). É o `padrao`.
  - **Partidas**: resultados pendentes + W.O. pendentes (consoles, no topo) + `OpenMatchesList`
    (passador) + `MatchHistoryList` (passador). Presente se há qualquer jogo ou console.
  - **Rodadas**: `LiberarRodadasButtons` + compartilhar rodada. Presente só quando
    `arbitrar && ehGerado && rodadasLiberacao.length > 0`.
  - **Vagas** (ou **Participantes** no avulso): `VagasSection`/`ParticipantsSection` + `InviteSection`.
- O **cabeçalho** e os painéis de **início** (rascunho) e a **Administração** ficam FORA das abas
  (a Administração logo abaixo do cabeçalho, como controle compacto — decisão do dono "encerrar/
  reabrir no cabeçalho"). Pré-início (rascunho) o conteúdo é mínimo; as abas vazias somem.

### Por que estado client (não `?aba=`)
A página dispara várias server actions com `revalidatePath` (liberar rodada, encerrar partida,
aprovar placar…). Abas por URL re-rodam TODAS as queries a cada troca; com estado client o
wrapper permanece montado e a troca é instantânea, e o React preserva a aba ativa através da
revalidação (o componente não desmonta). Custo: a aba ativa volta ao padrão num reload "duro"
(F5) — aceitável.

## Passador por rodada

### `src/features/match/components/RoundPager.tsx` (client)
```tsx
"use client"
function RoundPager({
  rounds,            // [{ rodada: number; content: ReactNode }] — já renderizado no servidor
  rodadaInicial,     // abre nesta (ativa p/ abertas; última p/ encerradas)
  tournamentId,      // p/ Fechar rodada
  rodadaAtiva,       // qual rodada pode ser fechada
  podeFechar,        // dono/arbitra
}) {
  const [idx, setIdx] = useState(() => indiceDe(rounds, rodadaInicial))
  // header: ‹ (prev, desabilita no 1º) · <select Rodada N de M> · (next, desabilita no último) ›
  //         + FecharRodadaButton quando rounds[idx].rodada === rodadaAtiva && podeFechar
  // corpo: rounds[idx].content
}
```
- Seletor de pulo = `<select>` nativo (ótimo no mobile, 38 opções) mostrando "Rodada N".
- `FecharRodadaButton` (client) renderizado pelo próprio passador na rodada ativa.
- Acessibilidade: `aria-label` nos botões prev/next; o `<select>` rotulado; região com
  `aria-live="polite"` anunciando "Rodada N de M" ao trocar.

### `OpenMatchesList` (continua RSC)
- Ramo **avulso** (sem `rodada`): inalterado (lista plana).
- Ramo **competitivo**: hoje empilha `rodadas.map(<section>…)`. Passa a montar
  `rounds = rodadas.map(r => ({ rodada: r, content: <ul>{matchesDaRodada.map(renderItem)}</ul> }))`
  e renderizar `<RoundPager rounds={rounds} rodadaInicial={rodadaAtiva} rodadaAtiva={rodadaAtiva}
  tournamentId podeFechar={mostrarEncerrar} />`. O cabeçalho "Rodada N" e o "Fechar rodada" saem
  do corpo e passam a ser do passador (sem duplicar). `renderItem` (com o `wa.me`/PII) roda no
  servidor — o nó vai pronto ao passador.

### `MatchHistoryList` (continua RSC)
- Sem `rodada` (avulso): lista plana atual.
- Com `rodada`: agrupa por rodada e usa `RoundPager` (sem Fechar), abrindo na ÚLTIMA rodada
  encerrada (a mais recente).

## Riscos e mitigações
- **Vazamento de gating entre abas**: gates ficam na RSC; um nó só entra na aba se o gate passa.
  O `TournamentTabs` nunca recebe conteúdo de aba proibida. ✔
- **PII (celular)**: `OpenMatchesList` continua RSC; nós renderizados no servidor. Nada de
  celular cru ao client. ✔
- **Avulso**: detectado por ausência de `rodada` (`temRodada`); mantém a lista plana — sem
  passador. ✔
- **Hidratação**: `tabs.tsx`/`RoundPager` são client; o conteúdo é RSC payload estável. Empty-
  states e labels determinísticos. ✔
- **Rodada inicial fora da lista** (ex.: `rodadaAtiva` nula ou sem partidas naquela rodada):
  `indiceDe` cai para 0 (primeira rodada disponível). ✔
- **Uma rodada só**: passador esconde prev/next (ou desabilita) e mostra só "Rodada N". ✔
