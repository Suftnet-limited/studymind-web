#!/bin/zsh
# Local UAT stack for StudyMind:  scripts/local-uat.sh start|stop|status
#   Postgres (existing local server) + Typesense (own container) + FastAPI backend + Next.js Web,
#   with all OpenAI traffic going through the budget proxy ($5 ceiling, concurrency 1, persisted ledger).
#
# Required environment (nothing secret lives in the repo):
#   BACKEND_DIR   studymind-ai checkout (default: ~/dev/studymind-final, must be on feat/web-integration-overview)
#   BACKEND_PY    python with the backend requirements (default: $BACKEND_DIR/.venv/bin/python)
# Postgres (own data dir ~/.studymind-uat/pgdata, port 55432) and Docker (Colima) are started automatically if needed.
# Optional:
#   PG_BIN        directory with psql (default /usr/local/opt/postgresql@18/bin), PG_PORT (55432), PG_USER (sm_test)
# State and secrets: ~/.studymind-uat/  (env = generated JWT/Typesense secrets, openai.key = YOUR dev key, both mode 600)
#   Real AI needs the key in ~/.studymind-uat/openai.key (or PROXY_OPENAI_API_KEY in the environment). It is given only to
#   the budget proxy; the backend holds a dummy key. Without it the stack starts but every AI call fails closed (HTTP 502).
set -u
WEB=${0:A:h:h}
HOME_DIR=$HOME/.studymind-uat; mkdir -p $HOME_DIR/ts $HOME_DIR/run $HOME_DIR/log; chmod 700 $HOME_DIR
BACKEND_DIR=${BACKEND_DIR:-$HOME/dev/studymind-final}
BACKEND_PY=${BACKEND_PY:-$BACKEND_DIR/.venv/bin/python}
PGDATA=$HOME_DIR/pgdata
export PATH=${PG_BIN:-/usr/local/opt/postgresql@18/bin}:$PATH
PGP=${PG_PORT:-55432}; PGU=${PG_USER:-sm_test}; DB=studymind_uat
TS_NAME=studymind-uat-typesense; TS_PORT=18109; PROXY_PORT=18301; API_PORT=8000; WEB_PORT=3100

http() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1"; }
stop_pid() { f=$HOME_DIR/run/$1.pid; [ -f $f ] && kill $(cat $f) 2>/dev/null; rm -f $f; }

case ${1:-} in
stop)
  stop_pid web; stop_pid backend; stop_pid proxy
  [ -f $PGDATA/postmaster.pid ] && pg_ctl -D $PGDATA stop -m fast >/dev/null 2>&1
  pkill -f "next dev -p $WEB_PORT" 2>/dev/null
  docker stop $TS_NAME >/dev/null 2>&1
  echo "stopped web, backend, proxy and $TS_NAME. Data is kept (database $DB, ~/.studymind-uat/ts, ledger). Postgres stopped."
  ;;
status)
  echo "web      $(http http://127.0.0.1:$WEB_PORT/api/studymind/auth/status)  http://localhost:$WEB_PORT"
  echo "backend  $(http http://127.0.0.1:$API_PORT/api/health)  http://127.0.0.1:$API_PORT/api/health"
  echo "proxy    $(http http://127.0.0.1:$PROXY_PORT/__ledger)  (ledger, localhost only)"
  echo "typesense $(http http://127.0.0.1:$TS_PORT/health)"
  curl -s --max-time 5 http://127.0.0.1:$PROXY_PORT/__ledger | head -c 600; echo
  ;;
start)
  [ -x $BACKEND_PY ] || { echo "BACKEND_PY not found: $BACKEND_PY" >&2; exit 2; }
  [ -d $BACKEND_DIR/app ] || { echo "BACKEND_DIR is not a studymind-ai checkout: $BACKEND_DIR" >&2; exit 2; }
  if ! pg_isready -h 127.0.0.1 -p $PGP >/dev/null; then
    [ -d $PGDATA ] || initdb -D $PGDATA -U $PGU --auth=trust >/dev/null || exit 2
    pg_ctl -D $PGDATA -o "-p $PGP -h 127.0.0.1" -l $HOME_DIR/log/postgres.log start >/dev/null || exit 2
    sleep 2
  fi
  pg_isready -h 127.0.0.1 -p $PGP >/dev/null || { echo "PostgreSQL is not accepting connections on $PGP" >&2; exit 2; }
  docker info >/dev/null 2>&1 || { command -v colima >/dev/null && colima start >/dev/null 2>&1; }
  docker info >/dev/null 2>&1 || { echo "Docker is not running (start Docker Desktop)" >&2; exit 2; }
  BR=$(git -C $BACKEND_DIR branch --show-current 2>/dev/null)
  [ "$BR" = feat/web-integration-overview ] || echo "WARNING: backend is on '$BR', tested branch is feat/web-integration-overview"
  if [ ! -f $HOME_DIR/env ]; then
    umask 077; printf 'JWT=%s\nTSKEY=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 24)" > $HOME_DIR/env
  fi
  source $HOME_DIR/env
  KEY=${PROXY_OPENAI_API_KEY:-}
  [ -z "$KEY" ] && [ -f $HOME_DIR/openai.key ] && KEY=$(tr -d '[:space:]' < $HOME_DIR/openai.key)
  AI=disabled; [ -n "$KEY" ] && AI=enabled

  psql -h 127.0.0.1 -p $PGP -U $PGU -d postgres -Atc "select 1 from pg_database where datname='$DB'" | grep -q 1 \
    || psql -h 127.0.0.1 -p $PGP -U $PGU -d postgres -Atc "create database $DB" >/dev/null
  if [ "$(docker inspect -f '{{.State.Running}}' $TS_NAME 2>/dev/null)" != true ]; then
    docker rm -f $TS_NAME >/dev/null 2>&1
    docker run -d --name $TS_NAME -p 127.0.0.1:$TS_PORT:8108 -v $HOME_DIR/ts:/data typesense/typesense:0.25.2 \
      --data-dir /data --api-key "$TSKEY" >/dev/null
  fi
  for i in $(seq 1 20); do [ "$(http http://127.0.0.1:$TS_PORT/health)" = 200 ] && break; sleep 1; done

  stop_pid proxy
  ( cd $WEB && PROXY_OPENAI_API_KEY="$KEY" MAX_CHAT_CALLS=${MAX_CHAT_CALLS:-200} MAX_EMBED_CALLS=${MAX_EMBED_CALLS:-400} MAX_USD=5 \
    PORT=$PROXY_PORT LEDGER_FILE=$HOME_DIR/ledger.json nohup node tests/fixtures/openai-budget-proxy.mjs \
    > $HOME_DIR/log/proxy.log 2>&1 & echo $! > $HOME_DIR/run/proxy.pid )
  stop_pid backend
  ( cd $BACKEND_DIR && nohup env -i PATH="$PATH" HOME="$HOME" APP_ENV=development OPENAI_API_KEY=dummy-backend-key-not-real \
    OPENAI_API_BASE=http://127.0.0.1:$PROXY_PORT/v1 OPENAI_BASE_URL=http://127.0.0.1:$PROXY_PORT/v1 \
    OPENAI_CHAT_MODEL=gpt-4.1-mini SIMILARITY_THRESHOLD=0.20 RETRIEVAL_VECTOR_K=100 OPENAI_LLM_MAX_RETRIES=1 OPENAI_EMBED_MAX_RETRIES=0 OPENAI_TIMEOUT_SECONDS=60 \
    JWT_SECRET_KEY=$JWT POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=$PGP POSTGRES_DB=$DB POSTGRES_USER=$PGU POSTGRES_PASSWORD=x \
    ENABLED_ROLES=student,lecturer,self_learner TYPESENSE_HOST=127.0.0.1 TYPESENSE_PORT=$TS_PORT TYPESENSE_API_KEY=$TSKEY \
    $BACKEND_PY -m uvicorn app.api.main:app --host 127.0.0.1 --port $API_PORT > $HOME_DIR/log/backend.log 2>&1 & echo $! > $HOME_DIR/run/backend.pid )
  for i in $(seq 1 40); do [ "$(http http://127.0.0.1:$API_PORT/api/health)" = 200 ] && break; sleep 2; done
  stop_pid web
  ( cd $WEB && DATABASE_URL=postgresql://$PGU@127.0.0.1:$PGP/$DB STUDYMIND_AI_BASE_URL=http://127.0.0.1:$API_PORT \
    SESSION_SECRET=$(openssl rand -hex 16) STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET= STRIPE_ACCESS_PRICE_ID= \
    nohup npx next dev -p $WEB_PORT > $HOME_DIR/log/web.log 2>&1 & echo $! > $HOME_DIR/run/web.pid )
  for i in $(seq 1 60); do [ "$(http http://127.0.0.1:$WEB_PORT/api/studymind/auth/status)" = 200 ] && break; sleep 2; done
  echo "real AI: $AI   (model gpt-4.1-mini, threshold 0.20, \$5 ceiling, concurrency 1)"
  [ $AI = disabled ] && echo "  -> put your development key in $HOME_DIR/openai.key (chmod 600) and re-run 'start' to enable paid AI"
  (cd $WEB && node scripts/uat-seed.mjs | head -1)
  $0 status
  ;;
docs)
  # builds the synthetic course files and uploads them through the app (real embeddings: needs the key, spends from the $5 ceiling)
  D=$HOME_DIR/docs; $BACKEND_PY $WEB/tests/fixtures/retrieval/build_docs.py $D --realistic || exit 2
  cd $WEB && DOCS_DIR=$D node scripts/uat-seed.mjs --documents
  ;;
*) echo "usage: $0 start|stop|status|docs" >&2; exit 2 ;;
esac
