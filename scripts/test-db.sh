#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs the sign-up/RLS checks.
# Needs a local Postgres you can connect to with psql (set PG* variables if required).
set -euo pipefail
cd "$(dirname "$0")/.."
DB="jobpilot_test_$$"
PSQL="psql -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "create database $DB"
cleanup() {
  psql -q -d postgres -c "drop database if exists $DB" >/dev/null
  psql -q -d postgres -c "drop role if exists anon; drop role if exists authenticated; drop role if exists service_role" >/dev/null 2>&1 || true
}
trap cleanup EXIT
$PSQL -d "$DB" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do $PSQL -d "$DB" -f "$f"; done
$PSQL -d "$DB" -f supabase/tests/rls_test.sql
