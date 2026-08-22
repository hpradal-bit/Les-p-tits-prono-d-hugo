#!/usr/bin/env bash
# Applique toutes les migrations sur une base PostgreSQL jetable, en local.
# Objectif : ne jamais découvrir une erreur SQL directement sur Supabase.
#
#   ./scripts/verify-migrations.sh
#
set -euo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/pgdata-pronos}
PGPORT=${PGPORT:-5433}
export PATH="$PGBIN:$PATH"

cleanup() { if [ "$(id -u)" = "0" ]; then su postgres -c "PATH=$PGBIN:\$PATH pg_ctl -D $PGDATA stop" >/dev/null 2>&1 || true; else pg_ctl -D "$PGDATA" stop >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

# PostgreSQL refuse de démarrer en root : on bascule sur l'utilisateur postgres
# quand c'est nécessaire.
run() { if [ "$(id -u)" = "0" ]; then su postgres -c "PATH=$PGBIN:\$PATH $1"; else eval "$1"; fi; }

rm -rf "$PGDATA"; mkdir -p "$PGDATA"
[ "$(id -u)" = "0" ] && chown postgres "$PGDATA"
run "initdb -D $PGDATA -A trust -U postgres" >/dev/null
run "pg_ctl -D $PGDATA -o '-p $PGPORT -k /tmp' -l /tmp/pg-pronos.log start" >/dev/null
sleep 2

psql -h /tmp -p "$PGPORT" -U postgres -q -c "create database pronos;"

# Doublure du schéma auth de Supabase (absent en local)
psql -h /tmp -p "$PGPORT" -U postgres -d pronos -q <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create role authenticated;
SQL

for f in supabase/migrations/*.sql; do
  printf '  %-45s' "$(basename "$f")"
  psql -h /tmp -p "$PGPORT" -U postgres -d pronos -v ON_ERROR_STOP=1 -q -f "$f"
  echo "✓"
done

psql -h /tmp -p "$PGPORT" -U postgres -d pronos -qtc \
  "select '  ' || (select count(*) from teams) || ' clubs · '
        || (select count(*) from rounds) || ' journées · '
        || (select count(*) from fixtures) || ' matchs';"

echo "  Toutes les migrations s'appliquent proprement."
