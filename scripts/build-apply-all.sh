#!/usr/bin/env bash
# Régénère supabase/apply-all.sql à partir des migrations 0001 à 0005.
set -euo pipefail
{
  echo "-- ============================================================================"
  echo "-- LES P'TITS PRONOS D'HUGO — Installation complète de la base"
  echo "-- Généré le $(date +%d/%m/%Y) — ne pas modifier à la main."
  echo "-- ============================================================================"
  for f in supabase/migrations/*.sql; do
    printf '\n-- ▼▼▼ %s ▼▼▼\n\n' "$(basename "$f")"
    cat "$f"
  done
} > supabase/apply-all.sql
echo "supabase/apply-all.sql régénéré."
