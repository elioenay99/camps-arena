# championship-theming Specification

## Purpose
TBD - created by archiving change add-cores-campeonato. Update Purpose after archive.
## Requirements
### Requirement: Tematização das páginas do campeonato pela sua identidade de cor

As páginas de um campeonato (torneio e divisão de liga) SHALL adotar a identidade de cor
do campeonato — primária e secundária — em seu conteúdo, mantendo legibilidade AA tanto
no tema claro quanto no escuro.

A tematização SHALL ser aplicada apenas ao **conteúdo do campeonato**; a navegação global
do app NÃO SHALL ser tematizada, permanecendo na marca Goliseu do tema ativo.

A cor primária SHALL recolorir a marca pervasiva do conteúdo (botões, links, realces,
foco) via override de `--primary`/`--primary-foreground`/`--ring`. A cor secundária SHALL
ser usada deliberadamente na identidade (escudo/gradiente, pílulas), sem remapear os tokens
neutros do app.

Os indicadores de **perigo** (zona de queda/playout) SHALL permanecer semânticos —
vermelho fixo (`--destructive`), não assumindo a cor do campeonato. A zona de **acesso**
(promoção) MAY adotar a cor primária do campeonato (é o comportamento atual, via
`--primary`), amarrando o destaque de promoção à identidade.

A derivação de tokens a partir das cores cruas SHALL preservar o matiz e normalizar a
luminância para a faixa legível do tema ativo, de modo que **qualquer** par de cores
escolhido pelo dono permaneça legível em claro e escuro **no caminho com relative color
syntax**; em navegadores sem esse suporte, o fallback usa a cor crua (funcional, sem
garantia AA). A tematização SHALL ser renderizável no servidor sem causar mismatch de
hidratação e SHALL recolorir automaticamente ao alternar claro/escuro.

#### Scenario: Par vívido permanece legível nos dois temas

- **WHEN** o dono escolhe um par de cores vívido (ex.: `#d6006e` + `#ffb300`) e abre a
  página do campeonato
- **THEN** no tema claro a primária aparece escurecida (texto claro sobre ela) e no tema
  escuro aparece clareada (texto escuro sobre ela), mantendo contraste AA em ambos

#### Scenario: Nav global não é tematizada

- **WHEN** uma página de campeonato com cores próprias é renderizada
- **THEN** a barra de navegação global continua na marca Goliseu do tema ativo, e apenas
  o conteúdo abaixo dela veste as cores do campeonato

#### Scenario: Divisões da mesma pirâmide têm cores distintas

- **WHEN** uma pirâmide define cores diferentes por divisão
- **THEN** a página de cada divisão é tematizada com a sua própria cor, herdando a da
  competição apenas quando a divisão não define a sua

#### Scenario: Zona de queda fica vermelha; acesso adota a cor

- **WHEN** uma tabela de classificação tematizada é exibida
- **THEN** a faixa da zona de queda/playout permanece vermelha (`--destructive`), e a
  faixa da zona de acesso aparece na cor primária do campeonato

#### Scenario: Alternar tema recolore sem recarregar

- **WHEN** o usuário alterna entre claro e escuro numa página de campeonato tematizada
- **THEN** os tokens derivados se recalculam pela cor crua via CSS, sem recarregar a
  página e sem flash de cor incorreta

### Requirement: Edição da identidade de cor pelo dono

O dono SHALL poder definir e alterar as cores do campeonato a qualquer momento, na criação
e depois dela, com pré-visualização. A escolha SHALL ser opcional: deixar em branco mantém
o tema padrão (ou herda o nível acima, no caso de divisão).

#### Scenario: Editar cores após a criação

- **WHEN** o dono abre a tela de edição de cores de um torneio já criado e define um par
- **THEN** as páginas daquele torneio passam a usar as novas cores, e limpar os campos
  volta ao tema padrão do app

