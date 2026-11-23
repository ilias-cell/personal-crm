#!/usr/bin/env bash
# The daily backup of the production database. Started by the systemd timer crm-backup.timer at 03:00 Moscow time
# (see systemd/); can also be run by hand: ssh crm '~/crm/backup-daily.sh'.
# It takes the same lock as deploy.sh and restore.sh, so it never touches the database while one of them works:
# if a deploy is running it waits for it, up to 30 minutes, and fails if the lock is still taken.
# Output goes to the server journal: journalctl -u crm-backup.service
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
set_env prod

require_env POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
take_lock 1800

./backup.sh daily </dev/null
