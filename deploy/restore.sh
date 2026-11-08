#!/usr/bin/env bash
# Restores the production database from a backup file. Run by a human only, never by CI:
#   ssh -t crm '~/crm/restore.sh ~/crm/backups/<file>.dump'
#
# Steps: check the file -> show what will be replaced and wait for "yes" -> back up the current database ->
# stop the app -> drop the database and create it empty -> load the backup -> migrations of the running
# app version -> start the same app version -> smoke /health.
# The app version is never changed (state/current and the images stay as they are).
# If a step after stopping the app fails, the script stops and leaves the app stopped: nothing is rolled back
# and the app is never started on a half-restored database.
set -euo pipefail

backup_arg=${1:?usage: restore.sh <backup-file>}
if [ ! -f "$backup_arg" ] || [ ! -r "$backup_arg" ]; then
  echo "ERROR: backup file $backup_arg does not exist or cannot be read. Nothing was changed." >&2
  exit 1
fi
backup_file=$(realpath -- "$backup_arg")

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

require_env
take_lock

if [ ! -s state/current ]; then
  fail "nothing is deployed (state/current is missing), so there is no app version to bring back up. Nothing was changed."
fi
APP_IMAGE=$(cat state/current)
export APP_IMAGE
version=$(current_version)

# Backup names end with -<app version>.dump (see backup.sh).
backup_name=$(basename -- "$backup_file")
backup_version=$(printf '%s' "$backup_name" | sed -n 's/^.*-\([^-]*\)\.dump$/\1/p')
backup_version=${backup_version:-unknown}

echo "==> Checking the backup file"
compose up -d --wait db </dev/null
if ! compose exec -T db pg_restore --list <"$backup_file" >/dev/null; then
  fail "$backup_file is not a readable database backup (pg_restore --list failed). Nothing was changed."
fi

db_name=$(compose exec -T db printenv POSTGRES_DB </dev/null)
db_user=$(compose exec -T db printenv POSTGRES_USER </dev/null)

echo
echo "Backup file:      $backup_file"
echo "                  $(du -h "$backup_file" | cut -f1), saved $(date -u -r "$backup_file" '+%Y-%m-%d %H:%M UTC')"
echo "Taken at version: $backup_version"
echo "Database:         \"$db_name\" (docker compose project $project) - ALL its current data will be DELETED"
echo "                  and replaced by this backup. A copy of the current database is taken first."
echo "App version:      $version - stays the same, it is brought back up after the restore."
if [ "$backup_version" != "$version" ]; then
  echo
  echo "WARNING: the backup was taken at version $backup_version, but the running app is $version."
  echo "         After loading the backup, the migrations of $version will be applied to it."
fi
echo
read -r -p 'Type yes to replace the database: ' answer || answer=
if [ "$answer" != yes ]; then
  echo "Not confirmed. Nothing was changed."
  exit 1
fi

echo "==> Copy of the current database"
if ! safety_copy=$(./backup.sh before-restore </dev/null); then
  fail "could not back up the current database. Nothing was changed: the database and the app are untouched."
fi

# From here on the app is stopped; any failure leaves it stopped and says how to get back.
abort() {
  echo "ERROR: $*" >&2
  echo "The restore did NOT finish. The app is STOPPED on purpose: it is not started on a half-restored database." >&2
  echo "The database as it was before this restore: $safety_copy" >&2
  echo "To put it back, run: ~/crm/restore.sh $safety_copy" >&2
  exit 1
}

echo "==> Stopping the app"
compose stop app </dev/null || abort "could not stop the app."

echo "==> Dropping database \"$db_name\" and creating it empty"
compose exec -T db dropdb -U "$db_user" --force "$db_name" </dev/null || abort "could not drop the database."
compose exec -T db createdb -U "$db_user" -O "$db_user" "$db_name" </dev/null || abort "could not create the empty database."

echo "==> Loading the backup"
# One transaction: either the whole backup is loaded or nothing is.
compose exec -T db pg_restore -U "$db_user" -d "$db_name" --exit-on-error --single-transaction --no-owner <"$backup_file" \
  || abort "pg_restore failed; the database is empty now."

echo "==> Migrations of the running app version $version"
compose run --rm -T migrate </dev/null || abort "migrations failed on the restored database."

echo "==> Starting the app (same version $version)"
compose up -d --no-deps app </dev/null || abort "could not start the app."

echo "==> Smoke test"
if ! ./smoke.sh http://127.0.0.1:3001/health "$version" 90; then
  compose logs --tail 40 app >&2 || true
  echo "ERROR: the database was restored, but the app does not pass /health." >&2
  echo "The database as it was before this restore: $safety_copy (to put it back: ~/crm/restore.sh $safety_copy)" >&2
  exit 1
fi

echo "==> Done: database \"$db_name\" restored from $backup_file, app $version is live"
echo "Copy of the database from before this restore: $safety_copy"
