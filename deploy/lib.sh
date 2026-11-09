# Shared helpers for the scripts in this folder. Sourced by them, never run on its own.
# Every script cd's into this folder first, so all paths here are relative to ~/crm on the server.

project=prod

compose() {
  docker compose -p "$project" -f compose.yaml --env-file .env "$@"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# Settings the app and its migrations need. Without OWNER_EMAIL the login migration cannot give the existing
# contacts to anyone; the rest is needed for people to log in.
all_env_keys="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB OWNER_EMAIL BETTER_AUTH_SECRET BETTER_AUTH_URL SMTP_URL MAIL_FROM"

# require_env [KEY...]: the file exists and every key (all of them by default) has a value in it.
# Only names are ever printed, never values.
require_env() {
  if [ ! -f .env ]; then
    fail "$PWD/.env is missing. It holds the settings and is created by hand once (see README)."
  fi
  chmod 600 .env

  local key missing=""
  for key in ${*:-$all_env_keys}; do
    if ! grep -Eq "^${key}=[^[:space:]]" .env; then
      missing="$missing $key"
    fi
  done
  if [ -n "$missing" ]; then
    fail "$PWD/.env has no value for:$missing. Add the lines as described in the README (section \"Выкатка на сервер\"); nothing was done."
  fi
}

# deploy.sh and restore.sh must never run at the same time: both stop, change or replace the database and the app.
# The lock is held until the script exits.
take_lock() {
  mkdir -p state
  exec 9>state/.lock
  if ! flock -n 9; then
    fail "another deploy.sh or restore.sh is running right now (lock $PWD/state/.lock). Wait for it to finish and run again."
  fi
}

# Version of the app that is running now: the tag (commit SHA) of the image in state/current, or "none".
current_version() {
  local image
  image=$(cat state/current 2>/dev/null || true)
  if [ -n "$image" ]; then
    echo "${image##*:}"
  else
    echo none
  fi
}
