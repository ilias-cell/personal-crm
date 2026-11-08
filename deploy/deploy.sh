#!/usr/bin/env bash
# Rolls out one app image on the server. CI copies the deploy/ folder to ~/crm and runs this script.
# Steps: database backup -> get the image -> migrations -> new app -> smoke /health -> nginx -> clean-up.
# It never rolls back by itself: if a step fails it stops and says so, and the next move is made by a human.
#
# Usage: deploy.sh <image> [registry-user]
#   <image>          full image name with the commit SHA as tag, e.g. ghcr.io/<owner>/<repo>:<sha>
#   [registry-user]  when given, the registry token is read from stdin (CI passes the job token this way);
#                    without it the image must already be on this machine (going back to an older one by hand)
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

image=${1:?usage: deploy.sh <image> [registry-user]}
registry_user=${2:-}
version=${image##*:}
app_domain=app.therooks.ru
# Deploy backups kept after a successful deploy; before-restore and manual backups are never removed.
keep_deploy_backups=10

require_env
take_lock

previous_current=$(cat state/current 2>/dev/null || true)

# Read the registry token before anything else touches stdin.
registry_token=
if [ -n "$registry_user" ]; then
  IFS= read -r registry_token
fi

export APP_IMAGE=$image

echo "==> Backup of the database (app version before this deploy: $(current_version))"
if ! backup_file=$(./backup.sh deploy </dev/null); then
  fail "the database backup failed. Nothing else was done: the app that was running is untouched."
fi

echo "==> Getting image $image"
if [ -n "$registry_user" ]; then
  # A throwaway Docker config: the token is used for this pull only and never stays on the server.
  docker_config=$(mktemp -d)
  trap 'rm -rf "$docker_config"' EXIT
  printf '%s' "$registry_token" | DOCKER_CONFIG=$docker_config docker login "${image%%/*}" -u "$registry_user" --password-stdin
  DOCKER_CONFIG=$docker_config docker pull "$image"
elif docker image inspect "$image" >/dev/null 2>&1; then
  echo "Image is already on this machine."
else
  fail "image $image is not on this machine and no registry user was given."
fi

echo "==> Migrations (one-off container from the new image)"
if ! compose run --rm -T migrate </dev/null; then
  fail "migrations failed. The new image was NOT started; the app that was running is untouched. Database backup from before this deploy: $backup_file"
fi

echo "==> Starting the new app"
compose up -d --no-deps app

echo "==> Smoke test: app container"
if ! ./smoke.sh http://127.0.0.1:3001/health "$version" 90; then
  compose logs --tail 40 app >&2 || true
  fail "the new app does not pass /health. Nothing was rolled back. Image that was current before: ${previous_current:-none}. Database backup from before this deploy: $backup_file"
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

echo "==> Cleaning up old deploy backups (keeping the newest $keep_deploy_backups)"
# The UTC date in the name makes name order the same as time order.
find backups -maxdepth 1 -type f -name 'deploy-*.dump' \
  | sort -r \
  | tail -n +$((keep_deploy_backups + 1)) \
  | xargs -r rm -f -- \
  || true

echo "==> Done: $image is live"
