#!/usr/bin/env bash
# Rolls out one app image on the server. CI copies the deploy/ folder to ~/crm and runs this script.
# It never rolls back by itself: if a step fails it stops and says so, and the next move is made by a human.
#
# Usage: deploy.sh <image> [registry-user]
#   <image>          full image name with the commit SHA as tag, e.g. ghcr.io/<owner>/<repo>:<sha>
#   [registry-user]  when given, the registry token is read from stdin (CI passes the job token this way);
#                    without it the image must already be on this machine (going back to an older one by hand)
set -euo pipefail

cd "$(dirname "$0")"

image=${1:?usage: deploy.sh <image> [registry-user]}
registry_user=${2:-}
version=${image##*:}
project=prod
app_domain=app.therooks.ru

compose() {
  docker compose -p "$project" -f compose.yaml --env-file .env "$@"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

if [ ! -f .env ]; then
  fail "$PWD/.env is missing. It holds the database settings and is created by hand once (see README)."
fi
chmod 600 .env

mkdir -p state
previous_current=$(cat state/current 2>/dev/null || true)

echo "==> Getting image $image"
if [ -n "$registry_user" ]; then
  # A throwaway Docker config: the token is used for this pull only and never stays on the server.
  IFS= read -r registry_token
  docker_config=$(mktemp -d)
  trap 'rm -rf "$docker_config"' EXIT
  printf '%s' "$registry_token" | DOCKER_CONFIG=$docker_config docker login "${image%%/*}" -u "$registry_user" --password-stdin
  DOCKER_CONFIG=$docker_config docker pull "$image"
elif docker image inspect "$image" >/dev/null 2>&1; then
  echo "Image is already on this machine."
else
  fail "image $image is not on this machine and no registry user was given."
fi

export APP_IMAGE=$image

echo "==> Database"
compose up -d --wait db

echo "==> Migrations (one-off container from the new image)"
if ! compose run --rm -T migrate </dev/null; then
  fail "migrations failed. The new image was NOT started; the app that was running is untouched."
fi

echo "==> Starting the new app"
compose up -d --no-deps app

echo "==> Smoke test: app container"
if ! ./smoke.sh http://127.0.0.1:3001/health "$version" 90; then
  compose logs --tail 40 app >&2 || true
  fail "the new app does not pass /health. Nothing was rolled back. Image that was current before: ${previous_current:-none}"
fi

echo "==> nginx site $app_domain"
site_available=/etc/nginx/sites-available/$app_domain
if sudo cmp -s "nginx/$app_domain.conf" "$site_available"; then
  echo "nginx config is up to date."
else
  # Only this app's own site file is touched, and only after "nginx -t" accepts the whole configuration.
  backup=state/$app_domain.conf.before-$(date +%Y%m%d-%H%M%S)
  sudo cp "$site_available" "$backup"
  sudo install -m 644 "nginx/$app_domain.conf" "$site_available"
  if ! sudo nginx -t; then
    sudo install -m 644 "$backup" "$site_available"
    fail "nginx rejected the new config; the old site file was put back (copy: $PWD/$backup)."
  fi
  sudo systemctl reload nginx
  echo "nginx reloaded."
fi

echo "==> Smoke test: https://$app_domain (through nginx, certificate checked)"
if ! ./smoke.sh "https://$app_domain/health" "$version" 60 --resolve "$app_domain:443:127.0.0.1"; then
  fail "the app is healthy but not reachable through nginx. Nothing was rolled back."
fi

echo "==> Remembering the rollout"
if [ -n "$previous_current" ] && [ "$previous_current" != "$image" ]; then
  echo "$previous_current" > state/previous
fi
echo "$image" > state/current

echo "==> Cleaning up old images (keeping the current and the previous one)"
keep_previous=$(cat state/previous 2>/dev/null || true)
# Only images of this app are considered; postgres and anything else on the server are left alone.
docker image ls --format '{{.Repository}}:{{.Tag}}' \
  | grep -F "${image%:*}:" \
  | grep -v -x -F -e "$image" -e "$keep_previous" \
  | xargs -r docker image rm \
  || true

echo "==> Done: $image is live"
