# match-score-modal — Delta Spec

## ADDED Requirements

### Requirement: Apresentação do modal de placar

O modal "Menu da Partida" SHALL ser apresentado com o idioma visual da marca:
título em tipografia de display, caixa do placar com profundidade (elevação) e o
número do placar com destaque. O botão de SALVAR o placar SHALL usar a cor
primária do tema (não o verde do WhatsApp, que SHALL ficar reservado ao atalho de
contato). A apresentação SHALL ser legível e operável no viewport de celular
(390px) e NÃO SHALL alterar a atualização otimista, a persistência, o atalho
`wa.me` por coluna (sem auto-chamada), a seleção de clube nem os papéis acessíveis
e regiões live.

#### Scenario: Botão de salvar usa a cor primária

- **WHEN** o modal é aberto
- **THEN** o botão de salvar o placar usa a cor primária do tema, e o verde
  permanece apenas no atalho de WhatsApp

#### Scenario: Apresentação não altera comportamento

- **WHEN** o usuário ajusta o placar, salva, ou aciona o atalho de WhatsApp
- **THEN** o comportamento (atualização otimista, persistência, link `wa.me` por
  coluna sem auto-chamada, papéis acessíveis) permanece como antes, apenas com a
  nova moldura visual
