## Context

A pirâmide de ligas (`league_*`) é uma camada fina sobre o motor de torneios (`tournaments`/`tournament_slots`/`match`). Uma pirâmide (`league_competitions`) tem temporadas (`league_seasons`) com divisões (`league_division_seasons`, cada uma **é** um `tournaments` formato `liga`), fronteiras de sobe/cai (`league_boundaries`) e competidores persistentes (`league_competitors`). Ao encerrar uma temporada, `confirmarFluxoTemporada` grava `posicao_final` (posição real, estilo competição — com **empates e lacunas**) em `league_division_entries` e monta a N+1.

O motor de jogo cobre mata-mata semeado (`gerarChaveMataMata`/`gerarChaveSemeada`, com ida-e-volta, byes e 3º lugar; **teto rígido `MATA_MATA_MAX_PARTICIPANTES = 32`**) e grupos+mata (`gerarFaseDeGrupos`/`gerarFaseGruposSemeada`; `validarGeometria` exige `qtd_grupos × classificados_por_grupo ∈ TOTAIS_CHAVE_VALIDOS` — potência de 2 — e grupo mínimo de 2). As RPCs `montar_playoff`/`montar_barragem` criam torneios mata-mata a partir de **competidores classificados**.

Esta change adiciona **copas** (nacionais e continentais) como entidade nova `cup_*`, alimentadas pela classificação final das ligas/copas, reusando o motor de jogo sem alterar a pirâmide.

Constraints: Next.js 16 RSC-first, Server Actions, Zod + RLS estrita, **sem service-role no cliente** (todos os clients em `src/lib/supabase/` são RLS-bound), DDL aplicada manualmente (schema.sql é a fonte de verdade, MCP mostra o SQL antes de aplicar em PROD), pt-BR, mobile-first, dark padrão.

## Goals / Non-Goals

**Goals:**
- Copa imortal com edições, cujos participantes derivam de **regras de qualificação** que leem a classificação final encerrada de origens (divisão de liga e/ou resultado de outra copa).
- **Continental cross-pirâmide** (origens de múltiplas pirâmides) com o mesmo mecanismo da nacional.
- **Ativação diferida**: edição só lê origens já encerradas.
- **Formato configurável** (mata-mata ou grupos+mata), reusando o motor existente sem alterá-lo.
- **Dedup por prioridade** com queda para o próximo elegível.
- **Ajuste manual** de participantes antes da montagem.
- Ciclo de vida da copa (arquivar/apagar com proteção de histórico).
- Zero regressão na pirâmide: copas apenas **leem** a classificação.

**Non-Goals:**
- Papéis de equipe da copa (`cup_members`) — follow-up; no MVP a copa é gerida só pelo dono (os torneios da edição já têm o sistema de equipe do torneio).
- Montagem automática atrelada ao calendário de uma pirâmide — o dono monta quando quiser.
- Mudar o motor de jogo, a pirâmide ou suas RLS.
- "Vagas de saída" da copa para a pirâmide (a copa pode ser *origem* de outra copa, mas não realimenta a pirâmide).
- Auto-reporte de placar pelo técnico do clube na copa (slots de copa têm `user_id` NULL; reporta o dono + equipe do torneio).

## Decisions

### D1 — Entidade nova `cup_*` (não generalizar `league_competitions`)
Quatro tabelas: `cup_competitions`, `cup_qualification_rules`, `cup_seasons`, `cup_entries`. **Por quê:** isola a semântica de copa, suporta cross-pirâmide naturalmente e não regride a pirâmide. **Alternativa rejeitada:** `league_competitions.tipo=copa` exigiria campos nullable + CHECKs condicionais, quebraria "competidor pertence a 1 competition" e forçaria toda query de liga a filtrar `tipo`.

### D2 — Uma edição materializa **um** `tournaments`
`cup_seasons.tournament_id` → o único torneio da edição (`mata_mata` ou `grupos_mata_mata`). Reusa RLS/UI de `tournaments`/`match`. A geometria de grupos é definida em `cup_competitions` e **congelada em `cup_seasons.config_snapshot`** ao montar. `tournaments` tem apenas `classificados_por_grupo` (NÃO `qtd_grupos` — `G` é derivável das partidas; `schema.sql:98`); `montar_copa` grava `classificados_por_grupo` no `tournaments` e `iniciarEdicaoCopa` lê `qtd_grupos`/`classificados_por_grupo` do `config_snapshot`, passando-os a `gerarFaseGruposSemeada`.

### D3 — Faixa de posições opera sobre um **rank de seeding contíguo por origem**
`cup_qualification_rules`: `origem_tipo` ∈ {`divisao`,`copa`}; divisão = `origem_competition_id`+`origem_nivel`; copa = `origem_cup_id` (XOR por CHECK); `posicao_inicio`/`posicao_fim` (≥1, fim≥início); `prioridade`; `rotulo`.

**A faixa NÃO indexa o valor cru de `posicao_final`** (que tem empates e lacunas — `computeStandings` é estilo competição: 1º,1º,3º…). A faixa indexa um **rank de seeding contíguo 1..n por origem**, obtido ordenando os competidores da origem por `(posicao_final asc, competitor_id asc)` e numerando 1..n. `num_vagas` = `posicao_fim − posicao_inicio + 1` (uma contagem de índices, não um intervalo de valores). No ramo `ranking_base='promedios'` o rank já é contíguo; a normalização é necessária para `ranking_base='posicao'` (default/legado).

**Fonte da classificação final (unificada divisão/copa):**
- **Divisão**: `league_division_entries.posicao_final` (NOT NULL) da temporada **encerrada de maior `numero`** daquela pirâmide, da `division_season` do `origem_nivel`, join `league_competitors` → `team_id`/`rotulo`. **Não** reusa `carregarLinhasBaseDivisao` (que é standings ao vivo do dono).
- **Copa**: `cup_entries.posicao_final` (NOT NULL) da edição **encerrada de maior `numero`** daquela copa (preenchido por `encerrarEdicaoCopa`, D11). Simétrico à divisão.

A leitura é feita por **RPCs SECURITY DEFINER gated** (`classificacao_final_divisao`, `classificacao_final_copa`) — ver D9 — para não depender da RLS row-level do dono da copa.

### D4 — Derivação em TS, leitura via RPC DEFINER, montagem via `montar_copa`
- **Leitura** (`classificacao_final_divisao(p_competition_id,p_nivel)`, `classificacao_final_copa(p_cup_id)`): RPCs DEFINER que aplicam o gate de consentimento (D9), acham a season/edição encerrada de maior `numero` (`ORIGEM_NAO_ENCERRADA` se nenhuma; `NIVEL_INEXISTENTE` se o nível sumiu) e retornam a lista ordenada com rank contíguo.
- **Derivação** (`derivarVagasCopa`, action; `derivarPool` TS puro testável): chama as RPCs de leitura por regra, monta o pool, aplica dedup (D5), grava `cup_entries` preview com `origem_rule_id`, `origem_season_id` (a season/edição consumida — rastreabilidade e `origem_descricao`), `seed`.
- **Montagem** (`montar_copa(p_cup_season_id,p_seeded_entry_ids[])`, RPC DEFINER): reusa de `montar_playoff` **apenas o esqueleto** — autorização (`auth.uid() = cup_competitions.created_by`, **não** `pode_gerir_competition`/helpers de `league_members`), advisory lock **namespace 2**, sentinela `cup_seasons.tournament_id`, idempotência promote-first, criação do `tournaments` rascunho, slots na ordem de seeding. **Diferente de `montar_playoff`:** os slots são inseridos por `team_id` (global) **ou** `rotulo` vindos de `cup_entries`, com `competitor_id = NULL` e `user_id = NULL` — sem lookup em `league_competitors`, sem `COMPETIDOR_DE_OUTRA_PIRAMIDE`. Pré-checks: `ENTRY_DE_OUTRA_EDICAO` (cada id ∈ `cup_entries` da edição), `COPA_HETEROGENEA` (D6), `COPA_LOTADA`/geometria (D7).
- **Início** (`iniciarEdicaoCopa`): lê os slots ordenados por `cup_entries.seed` e os passa a `semearPlayoffPorPosicao`/`gerarChaveSemeada` (mata-mata) ou `gerarFaseGruposSemeada` (grupos+mata). **Não** há remap via `tournament_slots.competitor_id` (é NULL); o canal de ordenação é `cup_entries.seed` → `slot_id`.

### D5 — Pool, dedup com cursor por origem, e re-derivação
Pool = união das regras, varrido em **uma passada determinística** ordenada por `(prioridade asc, rank-na-origem asc)`. Estado: (i) conjunto global de identidades já alocadas; (ii) **um cursor por origem**, compartilhado por todas as regras daquela origem (não por-regra). **Identidade de participante numa edição** = `team_id` (clube) ou `lower(trim(rotulo))` (rótulo), **sem** componente de origem — numa mesma edição, rótulos normalizados iguais SÃO o mesmo participante (alinhado ao UNIQUE de `cup_entries` e ao índice `slots_rotulo_unico_no_torneio` do `tournaments`). Numa continental `por_nome`, rótulos homônimos de pirâmides diferentes **colapsam** numa vaga (a UI avisa) — caso raro do modelo por-nome, decisão deliberada para manter TS e banco coerentes. Ao alocar uma identidade, o cursor da origem avança até o próximo rank não-alocado; ao atingir o fim da origem, a vaga **fica vazia** (pool com N reduzido) — **não** existe `cup_entry` placeholder (o CHECK `team_id XOR rotulo` o proíbe); o motor de mata-mata absorve o N reduzido como bye via `gerarChaveSemeada`. Em grupos+mata, vaga vazia é **descartada** (ver D7). O **ajuste manual** recusa adicionar participante de identidade já presente (`PARTICIPANTE_DUPLICADO`).

**Re-derivação** (edição em rascunho): entries `manual=true` são **âncoras** — consomem identidade no dedup e contam no N/seeding; qualquer derivado com identidade coincidente é descartado antes de inserir (compatível com o UNIQUE). Uma entry derivada **removida** pelo dono é registrada como exclusão persistente em **tabela própria `cup_season_exclusions (cup_season_id, identidade)`** (não como linha em `cup_entries`, preservando o invariante "sem placeholder") para não reaparecer na re-derivação.

### D6 — Copa homogênea (`por_nome`) — autoridade na montagem
`cup_competitions.por_nome` fixa clube ou rótulo. **Autoridade:** pré-check de `montar_copa` que lê `por_nome` da `league_division_seasons` **efetivamente consumida** (`por_nome` é por-divisão, não por-pirâmide) e da copa-origem; incompatível → `COPA_HETEROGENEA`. A validação na **criação de regra** é **best-effort/UX** (avisa se já existe uma division_season encerrada da origem com `por_nome` divergente), não a garantia final.

### D7 — Tamanho por formato (com teto do motor), sem conservação
- **mata-mata**: `2 ≤ N ≤ 32` (`MATA_MATA_MAX_PARTICIPANTES`). Vaga vazia ⇒ N menor ⇒ byes.
- **grupos+mata**: N = participantes **efetivos** (vagas vazias excluídas); `validarGeometria(N, qtd_grupos, classificados_por_grupo)` exige `qtd_grupos × classificados_por_grupo` potência de 2 (≤16 classificados, pois a chave ≤32) e grupos ≥2. `validarGeometriaCopa` (TS) e o pré-check de `montar_copa` recusam com erro claro (`COPA_LOTADA` para >32; geometria não-fechável orienta ajuste manual). A UI sinaliza o N-alvo/excesso **antes** de montar.

### D8 — Ativação diferida + pareamento edição↔temporada-origem
A derivação só considera origens com season/edição `encerrada`; nenhuma ⇒ `ORIGEM_NAO_ENCERRADA` (a edição não monta). "**Mais recente**" = a de **maior `numero`** entre as encerradas (`numero` é sequencial/único/monotônico; não usar `encerrada_em`, nullable). Cada `cup_entries` registra `origem_season_id` (a season/edição consumida) — rastreabilidade e `origem_descricao` ("4º Série A — Brasileirão T5"). Pareamento: a edição consome a mais recente encerrada **no momento da derivação**; o dono controla quando deriva/monta (a diferição). Se `origem_nivel` não existir na season consumida (a pirâmide encolheu) ⇒ `NIVEL_INEXISTENTE` (não derivar faixa vazia silenciosa); a UI avisa quando a profundidade da origem mudou desde a criação da regra.

### D9 — Autorização, RLS e consentimento cross-dono
- **Mutação**: INSERT/UPDATE/DELETE de `cup_*` e `montar_copa` exigem `created_by = auth.uid()` **direto** (sem helper de capacidade). Helper `eh_dono_cup(cup_competition_id)` (DEFINER) para as policies das tabelas-filhas; **EXECUTE concedido a anon+authenticated** (nunca revogado — policy precisa executá-lo; lição de `eh_dono_competition`).
- **SELECT**: `cup_competitions` `using (is_public or created_by = auth.uid())` — **`status` (ativa/arquivada) NÃO é gate de privacidade**. Filhas resolvem via `eh_dono_cup`/`is_public` da copa-mãe.
- **Consentimento de origem (cross-dono)**: uma regra só pode apontar para origem **pública** (`is_public`) **ou do próprio dono** da copa — validado na criação da regra e nas RPCs de leitura (`ORIGEM_INVISIVEL` caso contrário). As RPCs de leitura são **DEFINER** (não dependem da RLS row-level do dono da copa, que esconderia pirâmide arquivada e quebraria o pool silenciosamente), mas aplicam esse gate explicitamente.
- **Grants**: `montar_copa`/RPCs de leitura `revoke execute from public, anon; grant to authenticated`.
- O `tournaments` da edição nasce com `created_by` = dono da copa, herdando RLS/UI/equipe de torneio.

### D10 — Anti-ciclo copa→copa (server-side)
Proibir ciclos (A→B→…→A) no grafo de origens-copa. Caminhada **server-side em DEFINER** (trigger/função na criação/edição de regra) — `CICLO_DE_COPAS` — cobrindo ciclos transitivos. O Zod faz só checagem best-effort no cliente.

### D11 — Encerramento da edição grava a classificação final
`encerrarEdicaoCopa` (action **manual** do dono, espelhando `encerrarTorneio`, que é manual): quando o `tournaments` da edição encerra, computa `lerClassificacaoFinalCopa` (**TS puro novo**, não reuso direto de `resultadoDaChave`) e grava `cup_entries.posicao_final` + `cup_seasons.status='encerrada'` + `encerrada_em`. `lerClassificacaoFinalCopa`: percorre as partidas (`match`) da chave, reusa os helpers de baixo nível de `gerarChaveMataMata.ts` (`decidirConfronto`, rodadas/3º-lugar, `totalFases`) para inferir a fase de eliminação de cada participante e ordena `(fase alcançada desc, seed asc)` → campeão=1, vice=2, semifinalistas=3, quartas=5…; trata `terceiro_lugar` (com disputa, posições 3 e 4 saem do jogo extra; sem ela, ambos semifinalistas perdedores empatam em 3 e desempatam por seed) e `grupos_mata_mata` (eliminados na fase de grupos ficam **abaixo de todos os da chave**, ordenados entre si por colocação agregada na fase de grupos e desempate por seed). Essa classificação alimenta `origem_tipo=copa` e a página.

### D12 — Continental não alinha calendários; `cup_scope` é rótulo
Cada origem usa sua própria temporada/edição encerrada mais recente, **independentemente das demais** — uma edição pode misturar a temporada N de uma pirâmide e N+3 de outra (comportamento **aceito**, não bug; `origem_descricao` deixa explícito de qual temporada veio cada bloco). `cup_competitions.abrangencia` (`nacional`/`continental`) é **rótulo informativo** (exibição/filtro), **sem** invariante estrutural (não exige ≥2 pirâmides nem proíbe múltiplas).

## Risks / Trade-offs

- **`posicao_final` com empates/lacunas** → faixa sobre rank de seeding contíguo por origem (D3), com desempate `competitor_id`.
- **Leitura cross-pirâmide sob RLS retorna pool silenciosamente incompleto** (pirâmide arquivada/parcial) → RPCs DEFINER gated por consentimento (D9); erros `ORIGEM_INVISIVEL`/`ORIGEM_NAO_ENCERRADA`/`NIVEL_INEXISTENTE` em vez de vaga vazia silenciosa.
- **Pool excede o teto de 32 do motor** (continental cross-pirâmide) → `COPA_LOTADA` no `validarGeometriaCopa`/`montar_copa`; UI sinaliza antes; dono recorta manualmente.
- **Geometria de grupos não fecha** → N efetivo (vagas vazias excluídas) validado por `validarGeometria`; erro orienta ajuste.
- **Vaga dupla esgota a origem** → cursor por origem cai para o próximo; esgotada ⇒ vaga vazia (mata-mata: bye; grupos: descartada + revalida geometria).
- **Cross-pirâmide `por_nome` incompatível** → `COPA_HETEROGENEA` na montagem (autoridade), aviso na criação de regra.
- **Ciclo copa→copa** (transitivo) → detecção server-side DEFINER (`CICLO_DE_COPAS`).
- **Colisão de advisory namespace** → namespace 2 reservado a `montar_copa` (documentado no schema.sql).
- **Re-derivar perde ajuste manual** → manuais são âncoras; exclusões derivadas são persistentes (D5).
- **Duas edições consomem a mesma temporada-origem** → aceito no MVP (o dono controla a derivação); `origem_season_id` registra o consumo para rastreabilidade.
- **Derivação contar competidor 2× (copa + pirâmide no mesmo ano)** → não se aplica: a copa só LÊ classificação encerrada; não escreve em `league_*` nem entra no promédio da pirâmide.

## Migration Plan

1. Compor o SQL completo (4 tabelas + enums `cup_format`/`cup_scope`/`cup_origin_type`/`cup_season_status`/`cup_competition_status` + RPCs `montar_copa`/`classificacao_final_divisao`/`classificacao_final_copa` + helper `eh_dono_cup` + trigger anti-ciclo + policies). **Mostrar o SQL no chat** antes de aplicar.
2. Aplicar em **PROD** via MCP `apply_migration` (project `bfxmdypdxbbfedtqsqik`); `get_advisors` (esperar 0 ERROR). Espelhar em `supabase/schema.sql`; atualizar `database.types.ts` à mão; aplicar no **LOCAL** via `psql`.
3. Implementar actions/features/UI; gates; review adversarial do diff; validação ao vivo (390px, 2 contas).
4. **Sem migração de dados** (aditiva).
5. **Rollback**: `drop` das 4 tabelas + enums + RPCs + helper + trigger; nada depende delas; a pirâmide fica intocada.

## Open Questions

- Nenhuma bloqueante. A profundidade da classificação de copa-origem além de campeão/vice é resolvida por fase alcançada + desempate por seed (D11); revisável se a validação ao vivo apontar caso problemático.
