#!/usr/bin/env bash
# herd.sh — monta um workspace herdr para ESTE projeto (gerado pelo Claude Code).
# topologia detectada: single-package (app Next.js 16 "goliseu" na raiz)
# uso: ./herd.sh [nome-do-workspace]   |   SPAWN_AGENTS=1 ./herd.sh
# requer: herdr rodando + python3. rode de dentro de um pane herdr (HERDR_ENV=1).
set -euo pipefail

ROOT="${ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
WS_LABEL="${1:-$(basename "$ROOT")}"
SPAWN_AGENTS="${SPAWN_AGENTS:-0}"

get_ws()    { python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("result",d);print(r["workspace"]["workspace_id"])'; }
get_wtab()  { python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("result",d);print(r["tab"]["tab_id"])'; }
get_root()  { python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("result",d);print(r["root_pane"]["pane_id"])'; }
get_split() { python3 -c 'import sys,json;d=json.load(sys.stdin);r=d.get("result",d);print(r["pane"]["pane_id"])'; }

if [[ "${HERDR_ENV:-0}" != "1" ]] && ! herdr status server >/dev/null 2>&1; then
  echo "erro: herdr nao esta rodando. abra o herdr e rode de dentro de um pane." >&2; exit 1
fi

# cria uma tab: pane de agente (topo) + server (opcional) + teste (opcional, sem Enter).
# $1=label  $2=cwd  $3=serve_cmd(opcional)  $4=test_cmd(opcional)
add_unit() {
  local label="$1" cwd="$2" serve="${3:-}" test="${4:-}" base tab_json agent srv tst
  tab_json=$(herdr tab create --workspace "$WS" --cwd "$cwd" --label "$label")
  agent=$(printf '%s' "$tab_json" | get_root); base="$agent"
  echo "  $label: agente=$agent"
  if [[ -n "$serve" ]]; then
    srv=$(herdr pane split "$agent" --direction down --no-focus | get_split); base="$srv"
    herdr pane run "$srv" "cd \"$cwd\" && $serve"; echo "    server=$srv"
  fi
  if [[ -n "$test" ]]; then
    tst=$(herdr pane split "$base" --direction right --no-focus | get_split)
    herdr pane send-text "$tst" "cd \"$cwd\" && $test"; echo "    testes=$tst (pronto, sem Enter)"
  fi
  if [[ "$SPAWN_AGENTS" == "1" ]]; then herdr pane run "$agent" "claude"; fi
}

# idempotencia: nao recriar workspace com o mesmo label (um segundo `pnpm dev`
# disputaria a porta 3000). fail-open: se o list nao vier em JSON conhecido, segue.
ws_exists() {
  herdr workspace list 2>/dev/null | python3 -c '
import sys, json
label = sys.argv[1]
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
r = d.get("result", d) if isinstance(d, dict) else d
items = r.get("workspaces", []) if isinstance(r, dict) else r
sys.exit(0 if any(isinstance(w, dict) and w.get("label") == label for w in items) else 1)
' "$WS_LABEL"
}
if ws_exists; then
  echo "erro: workspace \"$WS_LABEL\" ja existe. feche-o no herdr ou rode: ./herd.sh <outro-nome>" >&2
  exit 1
fi

echo "==> workspace $WS_LABEL (root: $ROOT)"
WS_JSON=$(herdr workspace create --cwd "$ROOT" --label "$WS_LABEL" --focus)
WS=$(printf '%s' "$WS_JSON" | get_ws)
# single-package: sem tab "orquestrador" — a tab inicial do workspace vira um
# shell utilitario; o agente mora na tab da unidade (add_unit abaixo).
SHELL_PANE=$(printf '%s' "$WS_JSON" | get_root)
herdr tab rename "$(printf '%s' "$WS_JSON" | get_wtab)" "shell" >/dev/null
echo "  shell: $SHELL_PANE"

# ============== UNIDADES DETECTADAS (Claude Code preenche aqui) ==============
# single-package: app Next.js 16 "goliseu" na raiz.
# server: pnpm dev (http://localhost:3000). alternativa manual: docker compose up.
# testes: vitest — preparado no pane, sem Enter.
add_unit "goliseu" "$ROOT" "pnpm dev" "pnpm test"
# =============================================================================


# ======= INFRA (Claude Code adiciona SÓ se houver docker-compose/banco) ======
# docker-compose.yml (app dev em container) + Supabase local (porta do db lida
# de supabase/config.toml). conexao SEM credenciais: psql pede a senha.
INF_JSON=$(herdr tab create --workspace "$WS" --cwd "$ROOT" --label "infra")
INF_MAIN=$(printf '%s' "$INF_JSON" | get_root)
INF_LOG=$(herdr pane split "$INF_MAIN" --direction down --no-focus | get_split)
herdr pane run "$INF_LOG" "cd \"$ROOT\" && docker compose logs -f"
INF_DB=$(herdr pane split "$INF_MAIN" --direction right --no-focus | get_split)
herdr pane send-text "$INF_DB" "psql -h 127.0.0.1 -p 54322 -U postgres -d postgres"
# =============================================================================

cat <<MAP

workspace "$WS_LABEL" pronto.
no pane do agente da tab goliseu (ou no pane shell), dirija o trabalho via:
  herdr pane run <pane> "<tarefa>"
  herdr wait agent-status <pane> --status done --timeout 600000
  herdr wait output <pane> --match "<marcador de sucesso>" --timeout 120000
  herdr pane read <pane> --source recent --lines 120
MAP
