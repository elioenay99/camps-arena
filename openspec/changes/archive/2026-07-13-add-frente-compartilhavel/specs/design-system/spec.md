## ADDED Requirements

### Requirement: Primitiva de celebração/confete cor-aware e opt-out

O design system SHALL prover uma primitiva de celebração reusável (keyframes de burst
em `globals.css` + componente client) que aceita a COR do campeão (via CSS custom
property) para colorir o confete, em vez de uma cor fixa. O keyframe SHALL ter um nome
NOVO e distinto (ex.: `hs-burst`) para não colidir com o `hs-confetti`/`@keyframes
hs-confetti` já existente (loop infinito do hero da landing). Seguindo a convenção
opt-out da folha, o novo keyframe SHALL ser adicionado ao bloco
`@media (prefers-reduced-motion: reduce)`, e o componente SHALL checar
`matchMedia('(prefers-reduced-motion: reduce)')` para nem montar o confete quando o
usuário pede menos movimento (defesa em profundidade). A primitiva NÃO SHALL depender
de biblioteca externa nova.

#### Scenario: Confete usa a cor do campeão
- **WHEN** a celebração é disparada com a cor de um campeão
- **THEN** o confete é renderizado nessa cor (não numa cor fixa genérica)

#### Scenario: Reduced-motion não anima
- **WHEN** `prefers-reduced-motion: reduce` está ativo
- **THEN** os keyframes ficam neutralizados e o componente não monta o confete
