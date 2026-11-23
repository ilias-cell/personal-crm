# Shared helpers for the scripts in this folder. Sourced by them, never run on its own.
# Every script cd's into this folder first, so all paths here are relative to the folder of the environment
# on the server: ~/crm for prod, ~/crm-staging for the test stand.

# set_env <prod|staging>: picks the environment and sets everything that differs between the two.
# The same scripts and the same compose.yaml serve both; only the values below change.
# It refuses to run in the folder of the other environment, so the stand can never start with the production .env.
set_env() {
  env_name=${1:-}
  case $env_name in
    prod)
      project=prod
      env_folder=crm
      app_domain=app.therooks.ru
      app_port=3001
      app_mem_limit=0 # 0 = no limit, as it has always been
      db_mem_limit=0
      backup_before_deploy=yes
      ;;
    staging)
      project=staging
      env_folder=crm-staging
      app_domain=test-app.therooks.ru
      app_port=3002
      app_mem_limit=384m
      db_mem_limit=256m
      backup_before_deploy=no
      ;;
    *)
      fail "unknown environment \"$env_name\": use prod or staging."
      ;;
  esac

  if [ "$(basename "$PWD")" != "$env_folder" ]; then
    fail "the $env_name environment runs only from ~/$env_folder, but this script is in $PWD. Nothing was done."
  fi

  # Read by compose.yaml.
  export APP_PORT=$app_port APP_MEM_LIMIT=$app_mem_limit DB_MEM_LIMIT=$db_mem_limit
}

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

# Scripts of one environment must never run at the same time: they stop, change or replace its database and app.
# The lock is held until the script exits. Each environment has its own lock (its own state/ folder),
# so a deploy of the stand does not wait for a deploy of prod.
#   take_lock          fails at once if the lock is taken
#   take_lock <sec>    waits up to <sec> seconds for it (used by the daily backup: it waits for a running deploy)
take_lock() {
  mkdir -p state
  exec 9>state/.lock
  if ! flock -w "${1:-0}" 9; then
    fail "another script of this environment is running right now (lock $PWD/state/.lock). Wait for it to finish and run again."
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
