## ADDED Requirements

### Requirement: Estado-vazio de partidas ativas ciente de contexto (onboarding)

O estado-vazio de partidas ativas do painel (`EmptyActiveMatches`) SHALL ramificar em três estados conforme o contexto do usuário, garantindo que o primeiro clique SEMPRE leve a valor — nunca a um beco sem saída. Esse componente é renderizado quando o usuário não tem nenhuma partida ativa. A página do dashboard (Server Component) SHALL derivar no servidor dois
flags a partir dos torneios do usuário e passá-los ao componente: `semTorneios`
(verdadeiro quando o usuário não organiza nem participa de nenhum torneio — via
`getMeusTorneios`) e `temAvulsoAberto` (verdadeiro quando o usuário tem ao menos um
torneio AVULSO aberto — via `getOwnTournaments`). O atalho "Nova partida"
(`/dashboard/partidas/nova`) SHALL aparecer SOMENTE quando `temAvulsoAberto` for
verdadeiro, pois sem um torneio avulso aberto aquele destino é um beco.

Os três estados SHALL ser:

1. **Sem nenhum torneio** (`semTorneios` verdadeiro): o componente SHALL substituir o
   microcopy neutro "Nenhuma partida ativa" por copy de BOAS-VINDAS orientada à ação
   (headline acolhedora + uma linha curta indicando que se monta em cerca de 1 minuto),
   SHALL ocultar os dois CTAs atuais e SHALL exibir um único CTA primário com o texto
   EXATO "Criar meu primeiro campeonato — leva 1 minuto" apontando para
   `/dashboard/torneios/novo`. "Nova partida" NÃO SHALL aparecer.
2. **Com torneio(s) mas sem avulso aberto** (`semTorneios` falso e `temAvulsoAberto`
   falso): o componente SHALL manter o texto "Nenhuma partida ativa" (não é usuário
   novo), NÃO SHALL exibir "Nova partida", e SHALL exibir "Criar torneio" mais um link
   discreto "Ver meus torneios" apontando para `/dashboard/torneios`.
3. **Com avulso aberto** (`temAvulsoAberto` verdadeiro): o componente SHALL manter o
   comportamento atual — "Nova partida" (CTA primário, `/dashboard/partidas/nova`) e
   "Criar torneio".

Toda a copy SHALL ser pt-BR; o componente SHALL preservar a acessibilidade e os estilos
existentes (ícones decorativos `aria-hidden`, `:focus-visible`, alvo de toque ≥44px no
mobile, botões `rounded-full`, tokens de cor semânticos sem cor hardcoded) e SHALL
permanecer compatível com RSC-first (sem introduzir uma ilha client nova).

#### Scenario: Conta nova sem torneios vê só o CTA de primeiro campeonato

- **WHEN** um usuário sem nenhuma partida ativa e sem nenhum torneio (não organiza nem
  participa) abre `/dashboard`
- **THEN** o painel exibe copy de boas-vindas e um único CTA "Criar meu primeiro
  campeonato — leva 1 minuto" apontando para `/dashboard/torneios/novo`, e NÃO exibe o
  botão "Nova partida"

#### Scenario: Usuário com torneios mas sem avulso aberto não vê o beco

- **WHEN** um usuário sem partida ativa que já tem torneios, porém nenhum avulso aberto,
  abre `/dashboard`
- **THEN** o painel mantém "Nenhuma partida ativa", NÃO exibe "Nova partida", e exibe
  "Criar torneio" mais um link "Ver meus torneios" apontando para `/dashboard/torneios`

#### Scenario: Usuário com avulso aberto mantém o fluxo atual

- **WHEN** um usuário sem partida ativa que tem ao menos um torneio avulso aberto abre
  `/dashboard`
- **THEN** o painel exibe "Nova partida" (CTA primário, `/dashboard/partidas/nova`) e
  "Criar torneio", como hoje

#### Scenario: "Nova partida" só aparece com avulso aberto

- **WHEN** o estado-vazio de partidas ativas é renderizado com `temAvulsoAberto` falso
- **THEN** o botão "Nova partida" não é renderizado em nenhum dos outros dois estados
