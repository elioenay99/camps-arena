## Why

A landing pública de hoje (`src/app/page.tsx`) comunica só a camada mais RASA do
Goliseu — "crie torneios, lance placares, veja a classificação, sem planilha". A
`add-landing-depth-showcase` já melhorou a primeira dobra (a vitrine `LandingShowcase`:
mini-pirâmide Série A/B com escudos reais + hall da fama), mas o restante da página
ainda é um hero + 3 cards de destaque + footer. Um visitante anônimo NÃO consegue
enxergar a profundidade real do produto — divisões com **acesso e rebaixamento**,
**temporadas** que viram e acumulam, **promédio**, **copas imortais**, **hall da fama**
persistido, artilharia, insights de classificação (forma/destaques/confronto). Nada
disso aparece sem criar conta, e "sem planilha" (o benefício mais raso) ainda é o herói
da copy.

Isto é caro em dois sentidos. Primeiro, **aquisição**: quem chega não entende que o
Goliseu é uma liga nacional entre amigos com pirâmide e história que dura para sempre —
lê "mais um placar de bolão" e sai. Segundo, **conversão para pago**: sem uma narrativa
que ensine os termos de nicho (acesso, rebaixamento, promédio, temporada, copa
"imortal") e mostre a profundidade que justifica um plano premium, não há como preparar
o terreno para cobrança futura.

Esta change **reestrutura a home numa narrativa de conversão** — hook → prova →
profundidade → como funciona → prova social → FAQ → CTA — mantendo tudo VISÍVEL sem
login. Reaproveita a vitrine existente como bloco de PROVA (não a refaz) e adiciona
seções RSC novas que ensinam os diferenciais. É **frontend puro**: nenhuma migração,
nenhum DDL, nenhuma dependência nova, zero acesso ao banco. O objetivo é comunicar a
profundidade real e criar a estrutura/copy que preparam a conversão para pago — SEM
implementar cobrança/billing (fora de escopo).

## What Changes

- **Novo hook (headline).** O `<h1>` e o subtítulo do hero passam a liderar com a
  PROFUNDIDADE: "Monte a sua liga nacional entre amigos — divisões, acesso e
  rebaixamento, temporadas e copas que duram para sempre." "Sem planilha, sem discussão
  de placar" é REBAIXADO a benefício secundário (subtítulo/bullet), não mais o herói.
  O `HeroStadium`, o badge de topo e os CTAs ("Criar conta grátis" / "Já tenho conta")
  permanecem.
- **Prova (reuso, não refação).** A `LandingShowcase` (mini-pirâmide + hall da fama) é
  MANTIDA como o bloco visual de prova. Nada nela é reescrito.
- **Nova seção "Profundidade" (`ProfundidadeCards`, RSC).** Cards que ENSINAM os termos
  de nicho — acesso, rebaixamento, promédio, temporada, copa "imortal", hall da fama —
  cada um com um mock fiel/callout que mostra o conceito, no estilo da `LandingShowcase`.
- **Novos MOCKS FIÉIS anotados (RSC), não screenshots.** Componentes que reproduzem
  telas-chave com CALLOUTS de anotação ensinando os termos: classificação com a coluna
  "Forma"/destaques (Frente 1 — insights), página de competidor com hall/promédio, e
  bracket/mata-mata. Renderizados como React (dados curados hardcoded), preservando
  LCP/CLS e tema dark/light — decisão registrada no design (nada de PNG de screenshot).
- **Nova seção "Como funciona" (`ComoFunciona`, RSC).** 3-4 passos: 1. Monte a liga e as
  divisões · 2. Lance os placares · 3. Suba/caia e vire a temporada · 4. Eternize no hall
  da fama / nas copas.
- **Nova seção "Prova social" (`ProvaSocial`, RSC).** 2-3 depoimentos ILUSTRATIVOS
  (primeiro nome + papel genérico, ex.: "organizador de liga da firma"), redigidos como
  exemplos plausíveis — NÃO como afirmação de pessoa real. Enquanto forem placeholder, a
  seção traz um RÓTULO VISÍVEL ao usuário (ex.: eyebrow "Exemplos ilustrativos" e/ou
  marcação por card) deixando claro que não são clientes reais — comentário no código não
  basta (seria endosso enganoso na página de aquisição). Além do rótulo visível, marcados
  no código com `PLACEHOLDER — trocar por depoimentos reais` (o orquestrador sinaliza ao
  dono).
- **Nova seção "FAQ" (`Faq`, RSC).** No mínimo "É grátis?", "Preciso instalar?" (é PWA,
  roda no navegador, instalação opcional), "Serve para FIFA e eFootball?" (sim — placar é
  manual, serve qualquer jogo/campeonato entre amigos), + "Funciona no celular?" e "Posso
  ter várias divisões?". Acordeão via `<details>/<summary>` NATIVOS (sem ilha client, sem
  dependência nova — não há `accordion` em `src/components/ui/`), acessível por teclado.
- **CTA de conversão reforçado.** Um CTA claro de fechamento (criar conta/entrar — fluxo
  existente) após a narrativa; copy que comunica o valor premium (temporadas/copas
  ilimitadas, hall da fama), SEM billing. O footer é mantido/ajustado.

## Capabilities

### Modified Capabilities
- `landing-page`: a home pública ganha a narrativa de conversão completa (hook →
  prova → profundidade → como funciona → prova social → FAQ → CTA), com mocks fiéis
  anotados que ensinam os termos de nicho, mantendo a vitrine da primeira dobra e a
  profundidade visível sem login.

## Impact

- **Banco de dados:** NENHUM. Zero DDL, zero migração, zero query ao vivo. Todas as
  seções novas são RSC com dados curados hardcoded (mesmo padrão da `LandingShowcase`).
- **Código de aplicação (frontend puro):**
  - `src/app/page.tsx` — nova copy do hero (headline/subtítulo) e composição das seções
    novas na ordem da narrativa.
  - `src/features/landing/components/` — novos componentes RSC: `ProfundidadeCards`,
    `ComoFunciona`, `ProvaSocial`, e os mocks anotados (ex.: `MockClassificacao`,
    `MockCompetidor`, `MockBracket` + um `Callout` reutilizável). `Faq` com um leaf
    client (`FaqAccordion`) para o acordeão.
  - Reuso: `LandingShowcase`, `TeamCrest`, `escudoPublicUrl`, tokens da paleta
    (Dracula/Canarinho), primitivos shadcn já instalados (`Card`, `Button`),
    `<details>/<summary>` nativos para o FAQ, `lucide-react`. NENHUMA dependência nova
    (não existe `accordion` em `src/components/ui/` — não instalar).
- **Acessibilidade/tema/i18n:** pt-BR em toda a copy; tema dark/light preservado (tokens
  semânticos, sem cor hardcoded); blocos puramente ilustrativos marcados `aria-hidden`
  com `sr-only` descritivo (espelhando a `LandingShowcase`); FAQ acessível por teclado.
- **Performance:** RSC-first (interatividade só no acordeão do FAQ); sem CLS (escudos via
  `next/image` com dimensão fixa, sem imagens que reflowam); o hero/H1 continua sendo o
  LCP; nenhum asset/fonte pesado novo.
- **Segurança/autorização:** inalterada — a home continua só-deslogado (redirect para
  `/dashboard` se houver sessão); nenhuma superfície de dados nova.
- **Testes:** a home renderiza sem sessão exibindo as seções da narrativa (hook, prova,
  profundidade, como funciona, prova social, FAQ, CTA); o acordeão do FAQ abre/fecha; a
  suíte atual permanece verde. Validação visual a 390px (mobile-first) + dark/light.

## Fora de escopo (follow-up)

- **Billing/cobrança/planos pagos.** Esta change só cria a NARRATIVA e o CTA que
  preparam a conversão — não implementa checkout, gate de plano, nem página de preços.
- **Depoimentos reais.** A seção nasce com placeholders ilustrativos marcados no código;
  trocar por depoimentos reais é ação do dono.
- **Página `/precos` dedicada, testes A/B, analytics de conversão.** Não fazem parte
  desta entrega.
