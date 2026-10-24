#!/usr/bin/env bash
# Fills the EMPTY production database with test contacts: ~/crm/seed.sh
# Meant to be run once by hand after the first deploy. The seed itself refuses to touch a database
# that already has contacts, so test people are never mixed with real ones.
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f state/current ]; then
  echo "ERROR: nothing is deployed yet (state/current is missing)." >&2
  exit 1
fi

APP_IMAGE=$(cat state/current)
export APP_IMAGE

docker compose -p prod -f compose.yaml --env-file .env run --rm -T seed </dev/null
