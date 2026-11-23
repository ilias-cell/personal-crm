#!/usr/bin/env bash
# Fills the database of the test stand with a copy of the production data, from a production backup file.
# Also the way to rebuild a stand database that got spoiled. Run by a human only, never by CI:
#   ssh -t crm '~/crm-staging/refresh-staging-db.sh [backup-file]'
#
# Without an argument it takes the newest file in ~/crm/backups. For a fresher copy take a backup of prod first:
#   ssh crm '~/crm/backup.sh manual'
# The production database is never touched: the script only reads a backup file.
#
# Steps: check the file -> show what will be replaced and wait for "yes" -> stop the stand app -> drop the stand
# database and create it empty -> load the backup -> clear logins that came from prod (sessions, login links,
# login limits) -> migrations of the version running on the stand -> start the app -> smoke /health.
# If a step after stopping the app fails, the script stops and leaves the app stopped.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
set_env staging

prod_backups=$HOME/crm/backups

backup_arg=${1:-}
if [ -z "$backup_arg" ]; then
  # Names start with the kind (deploy, manual, ...), so the newest is picked by modification time, not by name.
  backup_arg=$(ls -t "$prod_backups"/*.dump 2>/dev/null | head -n 1 || true)
  if [ -z "$backup_arg" ]; then
    fail "there is no backup in $prod_backups to copy from. Take one: ssh crm '~/crm/backup.sh manual'. Nothing was changed."
  fi
fi
if [ ! -f "$backup_arg" ] || [ ! -r "$backup_arg" ]; then
  fail "backup file $backup_arg does not exist or cannot be read. Nothing was changed."
fi
backup_file=$(realpath -- "$backup_arg")

require_env
take_lock

if [ ! -s state/current ]; then
  fail "the stand is not deployed yet (state/current is missing), so there is no app version to bring up. Deploy it first. Nothing was changed."
fi
APP_IMAGE=$(cat state/current)
export APP_IMAGE
version=$(current_version)

echo "==> Checking the backup file"
compose up -d --wait db </dev/null
if ! compose exec -T db pg_restore --list <"$backup_file" >/dev/null; then
  fail "$backup_file is not a readable database backup (pg_restore --list failed). Nothing was changed."
fi

db_name=$(compose exec -T db printenv POSTGRES_DB </dev/null)
db_user=$(compose exec -T db printenv POSTGRES_USER </dev/null)

echo
echo "Backup file:  $backup_file"
echo "              $(du -h "$backup_file" | cut -f1), saved $(date -u -r "$backup_file" '+%Y-%m-%d %H:%M UTC')"
echo "Database:     \"$db_name\" (docker compose project $project, the TEST STAND) - ALL its current data will be DELETED"
echo "              and replaced by a copy of the production data from this file."
echo "App version:  $version - stays the same, it is brought back up after the copy."
echo
read -r -p 'Type yes to replace the stand database: ' answer || answer=
if [ "$answer" != yes ]; then
  echo "Not confirmed. Nothing was changed."
  exit 1
fi

abort() {
  echo "ERROR: $*" >&2
  echo "The copy did NOT finish. The stand app is STOPPED on purpose. Run this script again to rebuild the stand database." >&2
  exit 1
}

echo "==> Stopping the stand app"
compose stop app </dev/null || abort "could not stop the app."

echo "==> Dropping database \"$db_name\" and creating it empty"
compose exec -T db dropdb -U "$db_user" --force "$db_name" </dev/null || abort "could not drop the database."
compose exec -T db createdb -U "$db_user" -O "$db_user" "$db_name" </dev/null || abort "could not create the empty database."

echo "==> Loading the backup"
# One transaction: either the whole backup is loaded or nothing is. The prod owner and grants are not copied.
compose exec -T db pg_restore -U "$db_user" -d "$db_name" --exit-on-error --single-transaction --no-owner --no-acl <"$backup_file" \
  || abort "pg_restore failed; the database is empty now."

echo "==> Clearing logins that came from prod (sessions, login links, login limits)"
compose exec -T db psql -U "$db_user" -d "$db_name" -v ON_ERROR_STOP=1 \
  -c 'truncate table sessions, verifications, login_emails' </dev/null \
  || abort "could not clear the logins."

echo "==> Migrations of the running app version $version"
compose run --rm -T migrate </dev/null || abort "migrations failed on the copied database."

echo "==> Starting the app (same version $version)"
compose up -d --no-deps app </dev/null || abort "could not start the app."

echo "==> Smoke test"
if ! ./smoke.sh "http://127.0.0.1:$app_port/health" "$version" 90; then
  compose logs --tail 40 app >&2 || true
  fail "the data was copied, but the stand app does not pass /health."
fi

echo "==> Done: the stand database \"$db_name\" is a copy of $backup_file, app $version is live"
