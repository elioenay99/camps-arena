## ADDED Requirements

### Requirement: Navegação primária alcançável em um toque no mobile

A subárvore autenticada SHALL oferecer, no mobile, uma barra de navegação fixa no rodapé da
viewport com os destinos de uso diário, de modo que trocar de seção custe UM toque — sem
passar por um menu colapsado.

A barra SHALL:

- expor no mínimo os destinos Painel, Torneios, Pirâmides e Explorar, cada um apontando para
  a rota real correspondente;
- exibir **rótulo textual** em cada destino, não apenas ícone (ícone sozinho não é
  autoexplicativo e não é lido por todos os leitores de tela do mesmo jeito);
- marcar o destino da rota corrente com `aria-current="page"`, com a mesma semântica da
  navegação do header (igualdade exata para `/dashboard`, prefixo para os demais);
- garantir alvo de toque de no mínimo 44px por destino;
- reservar a área segura inferior (`env(safe-area-inset-bottom)`), para não ficar sob o
  indicador de gestos na PWA instalada.

A barra SHALL ser exclusiva do mobile: a partir de `sm:` ela desaparece e a navegação do
header volta a ser a única, com o layout de desktop inalterado.

A barra SHALL NOT ser renderizada na landing pública nem na subárvore `/demo`, que tem shell
próprio e não pode depender de componentes do app privado.

O menu colapsado do header SHALL permanecer: ele continua sendo o único caminho para os
destinos que não cabem na barra, e continua sendo a navegação do desktop.

#### Scenario: Troca de seção em um toque

- **WHEN** um usuário autenticado está em qualquer página do dashboard, em 390px de viewport
- **THEN** os quatro destinos principais estão visíveis no rodapé e cada um é alcançável com
  um único toque, sem abrir o menu

#### Scenario: Orientação sem abrir o menu

- **WHEN** a rota corrente corresponde a um dos destinos da barra
- **THEN** esse destino aparece marcado como ativo (`aria-current="page"`), e o usuário sabe
  onde está sem interagir

#### Scenario: Desktop inalterado

- **WHEN** a mesma página é exibida em `sm:` ou acima
- **THEN** a barra inferior não é exibida e a navegação é a do header, como antes da mudança

#### Scenario: Superfícies públicas sem a barra

- **WHEN** um visitante acessa a landing (`/`) ou qualquer página de `/demo`
- **THEN** nenhuma barra de navegação inferior é renderizada

### Requirement: Convivência entre a barra inferior e as camadas flutuantes

Nenhuma camada flutuante ancorada na borda inferior da viewport SHALL cobrir a barra de
navegação inferior, e a barra SHALL NOT cobrir essas camadas.

Isso vale explicitamente para:

- **os toasts**, ancorados em `bottom-center` desde a change `mobile-alvos-toque-safe-area`
  sob a premissa — agora superada — de que nenhuma tela tinha barra fixa no rodapé;
- **barras de ação persistentes de formulários longos** (a barra `Anterior / Próximo` dos
  wizards), que SHALL ancorar acima da barra de navegação, não sob ela.

O deslocamento SHALL ser aplicado apenas onde a barra de navegação existe: as superfícies
que não a têm (landing, `/demo`) SHALL manter as camadas flutuantes na posição atual.

O deslocamento SHALL derivar da altura declarada da barra de navegação, em vez de repetir
constantes de altura em cada consumidor.

#### Scenario: Toast após uma ação no dashboard

- **WHEN** uma ação no dashboard emite um toast, no mobile
- **THEN** o toast aparece acima da barra de navegação, e os quatro destinos permanecem
  visíveis e tocáveis enquanto ele está na tela

#### Scenario: Toast numa superfície pública

- **WHEN** um toast é emitido na landing ou em `/demo`, no mobile
- **THEN** ele permanece rente à borda inferior, como antes da mudança

#### Scenario: Barra de ação de wizard com a navegação presente

- **WHEN** um wizard longo exibe sua barra de ação persistente no mobile
- **THEN** as duas barras aparecem empilhadas, a de ação imediatamente acima da navegação,
  sem sobreposição e sem faixa vazia entre elas
