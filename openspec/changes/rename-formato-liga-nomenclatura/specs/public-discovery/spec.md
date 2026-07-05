# public-discovery — Delta Spec

## ADDED Requirements

### Requirement: Cópia da vitrine chama pirâmide de "pirâmide"

A vitrine "Explorar" SHALL usar a palavra "pirâmide(s)" (não "liga(s)") na cópia
textual que se refere ao TIPO de competição pirâmide (linhas cujo
`tipo === "liga"`), em coerência com a aba de navegação renomeada para
"Pirâmides". Isso cobre o subtítulo do cabeçalho ("Pirâmides e torneios públicos da comunidade.") e
o estado vazio ("Quando um organizador listar uma pirâmide ou torneio na
vitrine…"). A troca é apenas de microcópia — o loader, os filtros
(`status`/`is_public`/`listada`), os links e a exclusão de divisões NÃO SHALL
mudar. A legenda do card do tipo pirâmide ("Liga de divisões") fica fora deste
escopo.

#### Scenario: Cabeçalho e estado vazio nomeiam "pirâmide"

- **WHEN** um usuário autenticado abre `/dashboard/explorar` (com ou sem
  competições publicadas)
- **THEN** o subtítulo diz "Pirâmides e torneios públicos da comunidade." e o
  estado vazio diz "…listar uma pirâmide ou torneio na vitrine…", sem a palavra
  ambígua "liga"
