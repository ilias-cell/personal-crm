#!/usr/bin/env bash
# Rolls out one app image on the server. CI copies the deploy/ folder to ~/crm (prod) or ~/crm-staging (test stand)
# and runs this script there. The same script serves both; the environment is the first argument.
# Steps: database backup (prod only) -> get the image -> migrations -> new app -> smoke /health -> nginx
#        -> (prod) daily backup timer -> clean-up.
# It never rolls back by itself: if a step fails it stops and says so, and the next move is made by a human.
#
# Usage: deploy.sh <prod|staging> <image> [registry-user]
#   <image>          full image name with the commit SHA as tag, e.g. ghcr.io/<owner>/<repo>:<sha>
#   [registry-user]  when given, the registry token is read from stdin (CI passes the job token this way);
#                    without it the image must already be on this machine (going back to an older one by hand)
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh

env_name=${1:?usage: deploy.sh <prod|staging> <image> [registry-user]}
image=${2:?usage: deploy.sh <prod|staging> <image> [registry-user]}
registry_user=${3:-}
version=${image##*:}
# Images of the app older than this (by build date) are removed after a successful prod deploy.
image_max_age_days=14

set_env "$env_name"
require_env
take_lock

previous_current=$(cat state/current 2>/dev/null || true)

# Read the registry token before anything else touches stdin.
registry_token=
if [ -n "$registry_user" ]; then
  IFS= read -r registry_token
fi

export APP_IMAGE=$image

backup_file=
if [ "$backup_before_deploy" = yes ]; then
  echo "==> Backup of the database (app version before this deploy: $(current_version))"
  if ! backup_file=$(./backup.sh deploy </dev/null); then
    fail "the database backup failed. Nothing else was done: the app that was running is untouched."
  fi
else
  echo "==> No database backup in the $env_name environment (app version before this deploy: $(current_version))"
fi
backup_note=
if [ -n "$backup_file" ]; then
  backup_note=" Database backup from before this deploy: $backup_file"
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
  fail "migrations failed. The new image was NOT started; the app that was running is untouched.$backup_note"
fi

echo "==> Starting the new app"
compose up -d --no-deps app

echo "==> Smoke test: app container"
if ! ./smoke.sh "http://127.0.0.1:$app_port/health" "$version" 90; then
  compose logs --tail 40 app >&2 || true
  fail "the new app does not pass /health. Nothing was rolled back. Image that was current before: ${previous_current:-none}.$backup_note"
fi

echo "==> nginx site $app_domain"
site_available=/etc/nginx/sites-available/$app_domain
if ! sudo test -f "$site_available"; then
  fail "the nginx site $app_domain is not set up on this server yet (see README: the one-time setup of the test stand). The app is running, but not reachable from outside."
fi
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

if [ "$env_name" = staging ]; then
  # The stand is closed with a password, so from outside /health must answer 401. This proves that nginx,
  # the certificate (checked: no -k) and the password are all in place. The version was checked above, on the container.
  echo "==> Check: https://$app_domain asks for a password (through nginx, certificate checked)"
  code=000
  for _ in $(seq 1 15); do
    code=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 \
      --resolve "$app_domain:443:127.0.0.1" "https://$app_domain/health" || true)
    [ "$code" = 401 ] && break
    sleep 2
  done
  if [ "$code" != 401 ]; then
    fail "https://$app_domain/health answered $code instead of 401 (password wall). The app is healthy, but the stand is not properly closed or not reachable. Nothing was rolled back."
  fi
  echo "OK: 401 without a password."
else
  echo "==> Smoke test: https://$app_domain (through nginx, certificate checked)"
  if ! ./smoke.sh "https://$app_domain/health" "$version" 60 --resolve "$app_domain:443:127.0.0.1"; then
    fail "the app is healthy but not reachable through nginx. Nothing was rolled back."
  fi
fi

echo "==> Remembering the rollout"
if [ -n "$previous_current" ] && [ "$previous_current" != "$image" ]; then
  echo "$previous_current" > state/previous
fi
echo "$image" > state/current

if [ "$env_name" = prod ]; then
  echo "==> Daily backup timer"
  # Same pattern as the nginx site: the unit files in deploy/systemd are the source, the server copy is updated only when it differs.
  units_changed=no
  for unit in crm-backup.service crm-backup.timer; do
    if ! sudo cmp -s "systemd/$unit" "/etc/systemd/system/$unit"; then
      sudo install -m 644 "systemd/$unit" "/etc/systemd/system/$unit"
      units_changed=yes
    fi
  done
  if [ "$units_changed" = yes ]; then
    sudo systemctl daemon-reload
    echo "Unit files installed."
  fi
  if ! sudo systemctl enable --now crm-backup.timer; then
    fail "could not enable the daily backup timer. The new version is live; the timer is the only thing missing."
  fi
  if [ "$units_changed" = yes ]; then
    # A timer that is already running keeps its old schedule until it is restarted.
    sudo systemctl restart crm-backup.timer
  fi
  echo "Next daily backup: $(systemctl list-timers crm-backup.timer --no-legend | awk '{print $1, $2, $3}')"

  echo "==> Cleaning up images older than $image_max_age_days days (keeping prod current and previous, and the test stand current)"
  keep_previous=$(cat state/previous 2>/dev/null || true)
  # The image the test stand runs, so a prod deploy never takes it away.
  keep_staging=$(cat ../crm-staging/state/current 2>/dev/null || true)
  cutoff=$(date -d "$image_max_age_days days ago" +%s)
  # Only images of this app are considered; postgres and anything else on the server are left alone.
  docker image ls --format '{{.Repository}}:{{.Tag}}' \
    | grep -F "${image%:*}:" \
    | grep -v -x -F -e "$image" -e "$keep_previous" -e "${keep_staging:-none}" \
    | while read -r old_image; do
      built=$(docker image inspect --format '{{.Created}}' "$old_image" 2>/dev/null || true)
      if [ -n "$built" ] && [ "$(date -d "$built" +%s 2>/dev/null || echo "$cutoff")" -lt "$cutoff" ]; then
        echo "Removing $old_image (built $built)"
        docker image rm "$old_image" || true
      fi
    done \
    || true
else
  # No image clean-up here: the older images on the server include the ones prod rolls back to,
  # and only a prod deploy knows which to keep.
  echo "==> No image clean-up in the $env_name environment"
fi

echo "==> Done: $image is live in $env_name"
