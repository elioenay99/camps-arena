# Design — add-app-nav-e-landing

## Contexto

Pedido do usuário: navegar por botões, não por URL; visitante deve ver uma apresentação do produto com cadastro/login. O segmento `/dashboard` já agrupa todas as páginas autenticadas de navegação livre — um `layout.tsx` ali dá o shell a todas de uma vez (e às futuras).

## Decisões

### D1 — Shell no layout do segmento `/dashboard`

Header persistente (não re-renderiza entre navegações do segmento): marca, nav, tema, sair. Páginas viram só conteúdo. Boundaries (loading/error/not-found) também perdem seus headers — eles renderizam DENTRO do layout, então manter o span "ARENA" neles duplicaria a marca durante loading/erro.

### D2 — `/atualizar-senha` e auth fora do shell

São fluxos focados (recovery, login, cadastro): navegação ali distrai e, no caso de recovery, oferece atalhos que competem com a tarefa única. Mantidos como estão.

### D3 — Estado ativo numa folha client mínima

`aria-current="page"` exige `usePathname` → client. `NavLinks` é a ÚNICA folha client do shell (RSC-first); recebe os links como dados. Prefixo: `/dashboard` ativa só em igualdade exata (senão ficaria ativo em todas); as demais ativam por prefixo (ex.: `/dashboard/torneios/novo`).

### D4 — Logado em `/` → redirect `/dashboard`

A landing é material de aquisição; usuário com sessão não precisa dela. `getUser()` na RSC da raiz (mesma checagem das outras páginas). Visitante segue vendo a landing com CTAs.

### D5 — Middleware inalterado

Não-logado em rota protegida continua indo para `/login?redirectTo=...` (preserva o retorno pós-login). A landing é a porta de quem chega em `/` — mandar rota protegida para a landing adicionaria um clique sem ganho.

### D6 — Landing sem fetch

Conteúdo estático (hero + 3 destaques + CTAs) — a página fica estática exceto pela checagem de sessão (que a torna dinâmica, aceitável: é 1 chamada de auth). Sem screenshots/imagens por enquanto (sem assets no repo).

## Riscos

- **Toque do header em mobile**: nav com 3 links + tema + sair em `flex-wrap` — testado via build/inspeção; drawer só se crescer.
- **Páginas centradas (novo torneio/nova partida)**: ganham o header acima do card centrado — o `flex-1` do main mantém a centralização do miolo.
