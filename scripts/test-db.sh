#!/usr/bin/env bash
# Runs supabase/tests/*.test.sql against plain Postgres. Each test file gets
# a fresh database: Supabase stubs -> all migrations -> helpers -> test.
#
# Needs a Postgres server; set PG* env vars (default: localhost:5432,
# user postgres). CI uses a service container; locally, e.g.
#   docker run --rm -p 5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17
set -euo pipefail

cd "$(dirname "$0")/.."
export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
psql_quiet=(psql -v ON_ERROR_STOP=1 -q -X)
failed=0

for test in supabase/tests/*.test.sql; do
  db="canvas_test_$(basename "$test" .test.sql)"
  "${psql_quiet[@]}" -d postgres -c "drop database if exists $db" -c "create database $db" 2>/dev/null
  setup=(-f supabase/tests/_supabase_stubs.sql)
  for migration in supabase/migrations/*.sql; do setup+=(-f "$migration"); done
  setup+=(-f supabase/tests/helpers.sql -f "$test")
  # One session so helpers in pg_temp stay available to the test.
  if output=$("${psql_quiet[@]}" -d "$db" "${setup[@]}" 2>&1); then
    echo "ok   $test ($(grep -c 'PASS' <<<"$output") checks)"
  else
    echo "FAIL $test"
    grep -E 'FAIL|ERROR' <<<"$output" || echo "$output"
    failed=1
  fi
  "${psql_quiet[@]}" -d postgres -c "drop database if exists $db" 2>/dev/null
done

exit "$failed"
