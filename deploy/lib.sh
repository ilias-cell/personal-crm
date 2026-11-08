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

require_env() {
  if [ ! -f .env ]; then
    fail "$PWD/.env is missing. It holds the database settings and is created by hand once (see README)."
  fi
  chmod 600 .env
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
