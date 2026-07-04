#!/usr/bin/env bash
# =====================================================================
# Runner da suíte de INTEGRAÇÃO RLS (pgTAP num Postgres real)
# ---------------------------------------------------------------------
# Exercita as policies RLS e os SECURITY DEFINER de verdade — o que os ~100
# testes herméticos (vi.mock) NUNCA tocam. NÃO entra no `pnpm test` hermético
# (que roda sem banco); é uma suíte SEPARADA (`pnpm test:rls`) + job de CI
# dedicado.
#
# Dois modos:
#   LOCAL  (default): sobe um `postgres:17` efêmero via docker, aplica tudo,
#          roda os testes e DERRUBA o container ao sair.
#   CI     (RLS_PG_EXTERNAL=1): usa um Postgres já de pé (service container),
#          conectando pelas PG* padrão. Não sobe nem derruba nada.
#
# NÃO toca produção: só um Postgres local/efêmero. Sem segredos.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

CONTAINER="camps-arena-rls-tests"
IMAGE="postgres:17"

log() { printf '\n\033[1;35m» %s\033[0m\n' "$*"; }

if [[ "${RLS_PG_EXTERNAL:-0}" != "1" ]]; then
  # ---------- Modo LOCAL: sobe o container efêmero ----------
  export PGHOST=127.0.0.1
  export PGPORT="${RLS_PG_PORT:-55432}"
  export PGUSER=postgres
  export PGPASSWORD=postgres
  export PGDATABASE=postgres

  cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  cleanup

  log "Subindo $IMAGE efêmero ($CONTAINER) na porta $PGPORT"
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=postgres \
    -p "$PGPORT:5432" \
    "$IMAGE" >/dev/null

  log "Aguardando o Postgres aceitar conexões"
  for _ in $(seq 1 30); do
    if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U postgres >/dev/null
else
  # ---------- Modo CI: usa o service container (PG* já no ambiente) ----------
  log "Usando Postgres externo em ${PGHOST:-localhost}:${PGPORT:-5432}"
fi

PSQL=(psql -v ON_ERROR_STOP=1 -q)

log "1/5 Bootstrap de pré-requisitos (roles + auth/storage)"
"${PSQL[@]}" -f "$ROOT/supabase/ci-bootstrap.sql"

log "2/5 Aplica schema.sql (passe 1, tolerante — forward-ref)"
psql -q -f "$ROOT/supabase/schema.sql" >/dev/null 2>&1 || true

log "3/5 Aplica schema.sql (passe 2, estrito)"
"${PSQL[@]}" -f "$ROOT/supabase/schema.sql"

log "4/5 Grants de paridade (local-grants) + pgTAP + seed"
"${PSQL[@]}" -f "$ROOT/supabase/local-grants.sql"
"${PSQL[@]}" -f "$ROOT/supabase/tests/pgtap-1.3.3.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/supabase/tests/_setup.sql"

log "5/5 Rodando os testes pgTAP"
FAIL=0
TOTAL_OK=0
TOTAL_NOK=0
for f in "$ROOT"/supabase/tests/rls_*.sql; do
  name="$(basename "$f")"
  # -tA: só as linhas TAP (tuplas, unaligned). ON_ERROR_STOP=1: erro SQL cru
  # (fora de um throws_ok) aborta e falha o arquivo.
  out="$(psql -v ON_ERROR_STOP=1 -tA -f "$f" 2>&1)" || { printf '%s\n' "$out"; echo "not ok - $name ERRO SQL"; TOTAL_NOK=$((TOTAL_NOK + 1)); FAIL=1; continue; }
  printf '\033[1;36m# %s\033[0m\n' "$name"
  printf '%s\n' "$out"
  ok=$(printf '%s\n' "$out"   | grep -c '^ok '     || true)
  nok=$(printf '%s\n' "$out"  | grep -c '^not ok'  || true)
  TOTAL_OK=$((TOTAL_OK + ok))
  TOTAL_NOK=$((TOTAL_NOK + nok))
  if [[ "$nok" -ne 0 ]]; then FAIL=1; fi
done

echo
log "Resumo: $TOTAL_OK ok / $TOTAL_NOK not ok"
if [[ "$FAIL" -ne 0 ]]; then
  echo "RLS SUITE: FALHOU"
  exit 1
fi
echo "RLS SUITE: PASSOU"
