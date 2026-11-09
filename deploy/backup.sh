#!/usr/bin/env bash
# Takes a backup of the production database into ~/crm/backups.
#
# Usage: backup.sh <kind>
#   <kind>  what the backup is for, it starts the file name: deploy (made by deploy.sh), before-restore
#           (made by restore.sh), manual (taken by hand). Only "deploy" backups are ever cleaned up automatically.
#
# File name: <kind>-<UTC date YYYYmmdd-HHMMSS>-<app version running at that moment>.dump
# The full path of the new file is printed as the last line on stdout; everything else goes to stderr.
# A backup counts only when pg_restore can read it back; a broken or empty file is removed, never kept.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

kind=${1:?usage: backup.sh <kind>}
if ! [[ $kind =~ ^[a-z][a-z-]*$ ]]; then
  fail "kind must be lowercase letters and dashes, e.g. deploy or manual; got: $kind"
fi

require_env POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB

version=$(current_version)
# compose.yaml needs APP_IMAGE to be set even though the db service does not use it.
export APP_IMAGE=${APP_IMAGE:-$(cat state/current 2>/dev/null || echo unused-by-backup)}

# The backup holds personal data: only the owner can read the folder and the files.
umask 077
mkdir -p backups
chmod 700 backups

file=backups/$kind-$(date -u +%Y%m%d-%H%M%S)-$version.dump
partial=$file.partial
trap 'rm -f "$partial"' EXIT

echo "Backing up the database (app version $version) to $PWD/$file" >&2
compose up -d --wait db </dev/null >&2

# Custom format: compressed, and pg_restore can load it into an empty database.
# Inside the container pg_dump connects over the local socket, so no password is needed.
if ! compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' </dev/null >"$partial"; then
  fail "pg_dump failed; no backup was made."
fi
if [ ! -s "$partial" ]; then
  fail "pg_dump produced an empty file; no backup was made."
fi
if ! compose exec -T db pg_restore --list <"$partial" >/dev/null; then
  fail "the new backup cannot be read back by pg_restore; it was removed."
fi

mv "$partial" "$file"
trap - EXIT
echo "Backup saved: $PWD/$file ($(du -h "$file" | cut -f1))" >&2
echo "$PWD/$file"
