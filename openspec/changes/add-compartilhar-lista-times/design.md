# Design — add-compartilhar-lista-times

## Contexto e reuso

Espelha `add-compartilhar-rodada`, removendo a imagem. O que já existe e é reusado tal qual:

- `linkWhatsApp(celular)` (`src/lib/whatsapp.ts`): normaliza celular BR → `wa.me/55…`;
  `null` sem celular válido. **Fonte única** do atalho de contato.
- `carregarCelulares(supabase, ids)` (`src/lib/contatos.ts`) → `Map<id, celular|null>` via
  RPC `celulares_de_contato` (SECURITY DEFINER, gated por `eh_co_participante`). Degrada para
  mapa vazio em falha (o atalho some, a página não quebra).
- `getVagasDoTorneio(id)` (`src/features/tournament/data/`): já carrega cada vaga com
  `{ clube, escudoUrl, tecnico: { id, nome } | null, porNome }`. **Não muda** — segue sem PII.
- Padrão de compartilhamento do `CompartilharRodadaButton`: pré-abrir a aba no desktop antes
  de qualquer await (popup-blocker), Web Share no celular, `AbortError` ignorado, toasts.

## Decisões

### D1 — Texto: uma lista, não confrontos

`mensagemRodada` formata **confrontos** (`ladoA x ladoB`). A lista de times é **plana** — um
time por linha. Nova função dedicada `mensagemListaTimes` (não generalizar a da rodada: o
cabeçalho, o separador e a unidade são diferentes). Interface própria `TimeListaTexto`
(`{ clube; comandante?; celular? }`) — mesma forma de `LadoRodadaTexto`, nome próprio para
intenção clara.

Formato (aprovado por AskUserQuestion 2026-06-24):

```
<título> — Times

<clube> — <téc>: https://wa.me/55…
<clube> — <téc>
<clube> — ❌

Veja: <NEXT_PUBLIC_SITE_URL>/dashboard/torneios/<id>
```

- separador entre linhas = `\n` (lista compacta; a rodada usa `\n\n` para confrontos);
- linha em branco entre cabeçalho/corpo e corpo/rodapé;
- `<título>` cai para "Campeonato" se vazio; o ❌ é o único "emoji" (unicode estável).

### D2 — ❌ igual à rodada

Regra **idêntica** a `mensagemRodada`: ❌ **só** quando não há comandante. Técnico sem
celular → só o nome (sem link, sem ❌). Decisão de produto do dono no AskUserQuestion (opção
"Igual à rodada"), não reverter sem perguntar.

### D3 — Sem imagem ⇒ componente próprio, não reaproveitar a rota OG

Não há `next/og`, rota de imagem nem `outputFileTracingIncludes`. O componente client é uma
**versão enxuta** do `CompartilharRodadaButton` sem o caminho de arquivo:

- celular: `navigator.share({ text, title })` (sem `files`);
- desktop/sem Web Share: copia o texto (`clipboard.writeText`) e abre `https://wa.me/?text=`.
- `AbortError` (usuário cancelou) não vira toast de erro.

Mantém o pré-open da aba no desktop (consistência + robustez a popup-blocker), mesmo sem
await pesado antes do share. Não toca o `CompartilharRodadaButton` (zero risco de regressão).

### D4 — Montagem e gating na página

A página já carrega `vagas` e tem o `supabase`. Adiciona:

```
const celularPorTecnico = await carregarCelulares(
  supabase, vagas.flatMap((v) => (v.tecnico ? [v.tecnico.id] : []))
)
const textoListaTimes = mensagemListaTimes({
  titulo,
  times: vagas.map((v) => ({
    clube: v.clube,
    comandante: v.tecnico?.nome ?? null,
    celular: v.tecnico ? celularPorTecnico.get(v.tecnico.id) ?? null : null,
  })),
  tournamentId: id,
})
```

Passado à `VagasSection` via prop opcional `compartilhar?: { titulo; texto }`, renderizada só
quando `moderar && ehGerado && vagas.length > 0`. O `carregarCelulares` extra roda só quando
o botão será exibido (evita PII desnecessária e 1 RPC à toa).

### D5 — Placement: cabeçalho da VagasSection

O botão fica ao lado do `<h2>Vagas</h2>` (a "lista dos times"), não numa seção separada —
"lista dos times tipo igual a da rodada" (perto da lista). `VagasSection` (RSC) importa o
componente client e o renderiza só quando `compartilhar` chega.

## Riscos e mitigações

- **Links vazios para quem não é co-participante**: esperado e seguro (RPC gateia PII). O
  alvo (dono) é sempre co-participante via `created_by`. Moderador externo (sem participação)
  veria nomes sem link — degradação graciosa, sem vazamento.
- **Torneio por-nome**: vagas sem técnico ⇒ lista toda com ❌. Continua válida como relação
  de competidores; o botão aparece se houver vagas (não esconder por isso).
- **Duplicação do boilerplate de share**: aceita por ora (não regredir o botão da rodada). Se
  a revisão adversarial apontar, extrair util client compartilhado em follow-up.

## Fora de escopo

Imagem da lista, automação/cron, API oficial, lista no avulso (participantes), menção real.
