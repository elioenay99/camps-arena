/**
 * Backfill dos escudos de clube para o Storage próprio (change
 * add-escudos-self-host). Migra os registros LEGADOS de `public.teams` cujo
 * `escudo_url` ainda aponta pro CDN da API-Football (ou é nulo mas tem
 * `external_id`), re-hospedando a imagem em `escudos/<chave>.png` e gravando a
 * URL pública do Storage. Reusa o MESMO helper do runtime (`rehospedarEscudo`)
 * → comportamento idêntico ao selectTeam.
 *
 * PRÉ-REQUISITO: aplicar ANTES a DDL de
 * `openspec/changes/add-escudos-self-host/ddl.sql` (bucket `escudos` + policies
 * + CHECK relaxada). Sem a CHECK relaxada, o UPDATE com a URL do Storage é
 * rejeitado pelo banco.
 *
 * Idempotente e resiliente: só toca registros ainda não migrados; pula falhas
 * isoladas (best-effort do helper devolve a origem → sem UPDATE); nunca derruba
 * o lote por um erro pontual.
 *
 * COMO RODAR (o orquestrador executa, com autorização do dono — NÃO commitado,
 * NÃO rodado pelo specialist):
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/backfill-escudos.ts
 *
 * O service_role IGNORA a RLS (necessário pro UPDATE em `teams`, que não tem
 * policy de UPDATE, e pro upsert no bucket). NUNCA usar `NEXT_PUBLIC_` para a
 * service key. `--dry-run` lista o que faria sem escrever.
 */
import { createClient } from "@supabase/supabase-js"

import { rehospedarEscudo } from "../src/lib/escudos"

const API_SPORTS_PREFIX = "https://media.api-sports.io/"
const DRY_RUN = process.argv.includes("--dry-run")

type TeamRow = {
  id: string
  external_id: string | null
  provider: string | null
  escudo_url: string | null
}

/**
 * Reconstrói a URL de origem a migrar. Preferimos o próprio `escudo_url` (já é
 * a origem no CDN); se nulo mas houver `external_id` de api-football, montamos a
 * URL canônica do CDN. Sem origem viável → null (pula).
 */
function origemDoTime(t: TeamRow): string | null {
  if (t.escudo_url && t.escudo_url.startsWith(API_SPORTS_PREFIX)) return t.escudo_url
  if (!t.escudo_url && t.external_id && t.provider === "api-football") {
    return `${API_SPORTS_PREFIX}football/teams/${t.external_id}.png`
  }
  return null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente."
    )
    process.exit(1)
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Candidatos: escudo no CDN (a migrar) OU nulo (talvez reconstruível). Os que
  // já estão no Storage não casam nenhum filtro → não são tocados (idempotente).
  const { data, error } = await supabase
    .from("teams")
    .select("id, external_id, provider, escudo_url")
    .or("escudo_url.like.https://media.api-sports.io/%,escudo_url.is.null")

  if (error) {
    console.error("Falha ao listar teams:", error.message)
    process.exit(1)
  }

  const times = (data ?? []) as TeamRow[]
  console.log(`Candidatos: ${times.length}${DRY_RUN ? " (dry-run)" : ""}`)

  let migrados = 0
  let pulados = 0
  let falhas = 0

  for (const t of times) {
    const origem = origemDoTime(t)
    if (!origem) {
      pulados++
      continue
    }
    // Chave determinística: external_id quando houver (bate com o selectTeam),
    // senão o próprio id do time (legado sem external_id).
    const chave = t.external_id ?? t.id

    if (DRY_RUN) {
      console.log(`[dry] ${t.id} (${chave}) <- ${origem}`)
      migrados++
      continue
    }

    let novaUrl: string
    try {
      novaUrl = await rehospedarEscudo(supabase as unknown as never, chave, origem)
    } catch (e) {
      console.warn(`  ! rehost lançou para ${t.id}:`, e)
      falhas++
      continue
    }

    // Helper devolve a própria origem quando falha (non-fatal): nada a gravar.
    if (novaUrl === origem) {
      console.warn(`  ~ rehost sem efeito para ${t.id} (fallback origem) — pulando`)
      falhas++
      continue
    }

    const { error: upErr } = await supabase
      .from("teams")
      .update({ escudo_url: novaUrl })
      .eq("id", t.id)
    if (upErr) {
      console.warn(`  ! UPDATE falhou para ${t.id}:`, upErr.message)
      falhas++
      continue
    }
    migrados++
    console.log(`  ok ${t.id} (${chave}) -> ${novaUrl}`)
  }

  console.log(
    `\nResumo: ${migrados} migrados, ${pulados} sem origem, ${falhas} falhas de ${times.length}.`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
