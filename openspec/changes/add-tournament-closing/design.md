# Design — add-tournament-closing

## Context

`tournament_status` tem `encerrado` desde o início, com efeitos prontos em
todas as camadas; falta o caminho de transição. O padrão de lifecycle já
existe nas PARTIDAS (`mudarStatusComoDono` em match.ts): sessão + propriedade
por filtro + `.select()` de confirmação + revalidate. Decisões de produto:
dono encerra e reabre; encerrar livre com aviso.

## Goals / Non-Goals

**Goals:**

- Fechar o ciclo de vida do torneio pela UI com o mínimo de superfície nova.
- Reabertura segura: nunca produzir liga/mata-mata "ativo" sem partidas.

**Non-Goals:**

- DELETE de torneio pela UI (a RLS de DELETE existe, mas exclusão é outra
  conversa — histórico some).
- Encerramento automático (ex.: ao encerrar a final do mata-mata) — gesto
  explícito do dono, modelo árbitro; automação fica para feedback futuro.
- Notificar participantes do encerramento.

## Decisions

### D1 — Actions no padrão mudarStatusComoDono, com transições por FILTRO

`encerrarTorneio`: `.eq(created_by).neq(status, 'encerrado')` — rascunho é
encerrável ("cancelar" um torneio que não começou). `reabrirTorneio`:
`.eq(created_by).eq(status, 'encerrado')`. Resposta única para inexistente/
alheio/estado errado (sem oráculo). `.select()` confirma a escrita (corrida →
0 linhas → "recarregue"). Revalida `/dashboard`, `/dashboard/torneios` e a
página do torneio.

### D2 — Status de retorno da reabertura é DERIVADO, não lembrado

Não há histórico de status. Regra derivável do próprio estado: formato gerado
(`liga`/`mata_mata`) sem NENHUMA partida com `rodada` → volta a `'rascunho'`
(tabela/chave nunca gerada; "ativo" sem partidas seria beco — o painel de
Iniciar só aparece em rascunho); qualquer outro caso → `'ativo'`. Avulso
sempre volta a `'ativo'` (avulso nasce ativo; rascunho não é estado natural
dele).

### D3 — Confirmação em dois cliques com aviso, sem dependência nova

O repo não usa AlertDialog. O botão "Encerrar torneio" arma um estado local de
confirmação ("Confirmar encerramento — N partidas em aberto serão congeladas";
clique fora do fluxo cancela/expira) e só então chama a action — padrão
useTransition + toast (MatchStatusButton). O `N` vem de `partidasAbertas` que
a página já tem (mesma viagem ao banco — zero query extra).

### D4 — Posição na página: seção "Administração" no FIM da página

"Encerrar torneio" aparece para o dono quando `status !== 'encerrado'`;
"Reabrir torneio" quando `status === 'encerrado'` — este último é o PRIMEIRO
controle do dono visível em torneio encerrado (os demais usam o gate
`podeGerirPartidas`, que continua false ali — partidas seguem congeladas até
reabrir). Fim da página (padrão "danger zone"), separado por borda: ação de
consequência ampla fica longe dos controles do dia a dia e fora do alcance de
cliques acidentais no header.

## Riscos / Trade-offs

- **[Encerrar com partidas abertas]** → escolha de produto: partidas abertas
  ficam congeladas e fora da classificação. O aviso na confirmação torna o
  efeito explícito; reabrir desfaz.
- **[Sem trigger de status em tournaments]** → POST direto do dono mudando o
  próprio status é auto-sabotagem sem vítima terceira (mesmo raciocínio do
  D10 do mata-mata); participante não passa pela RLS de UPDATE.
- **[Encerrar abria a janela de saída no mata-mata em curso]** → achado da
  validação adversarial: o congelamento de participants valia só em 'ativo';
  encerrar liberava sair/remover, e reabrir (status volta a 'ativo') recriava
  o travamento permanente do avanço de fase — sem recuperação (convite rejeita
  fora de rascunho). Fix: o congelamento passa a valer para mata-mata com a
  CHAVE GERADA (ativo, ou encerrado com partidas geradas) em action + policy +
  UI. Custo aceito: não dá para sair da lista de um mata-mata concluído — a
  participação numa chave disputada é histórico (o BracketView a referencia).
  Mata-mata cancelado no rascunho segue livre.
- **[Reabrir mata-mata com chave congelada]** → reabrir devolve 'ativo' e o
  dono volta a poder avançar fase/encerrar partidas — seguro com o
  congelamento estendido acima.

## Migration Plan

Seção 11 de `docs/pendencias-manuais.md`: reaplicar a policy
`participants_delete_self_or_owner` com a cláusula estendida (idempotente,
1 statement). Sem ela o app funciona — actions e UI já aplicam a regra — mas
o backstop do banco contra POST direto fica defasado. Rollback: recriar a
policy na versão da seção 10.

## Open Questions

Nenhuma.
