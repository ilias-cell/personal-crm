#!/usr/bin/env bash
# One-time setup of the test stand domain on the server: certificate and nginx site. Safe to run again.
#   ssh crm '~/crm-staging/setup-staging-domain.sh'
#
# Before it: the DNS record test-app.therooks.ru points to this server, and the password file exists
# (/etc/nginx/htpasswd-test-app, see README).
# Steps: check -> temporary http-only site (so certbot can answer the challenge) -> certificate -> full site -> reload.
# Only files of this domain are added: the landing's, the prod app's and the catch-all nginx files and the
# certificate of therooks.ru are never touched.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck source=deploy/lib.sh
. ./lib.sh
set_env staging

domain=$app_domain
available=/etc/nginx/sites-available/$domain
enabled=/etc/nginx/sites-enabled/$domain
htpasswd=/etc/nginx/htpasswd-test-app

# The file must hold a user with a real password hash (an empty password gives a line like "ilias:").
if ! sudo grep -Eq '^[^:]+:\$apr1\$[^:]+$' "$htpasswd" 2>/dev/null; then
  fail "$htpasswd is missing, empty or has no password hash. Create the password first (README, \"Тест-стенд\"); nothing was done."
fi

if ! getent hosts "$domain" >/dev/null; then
  fail "$domain does not resolve yet. Add the DNS record first; nothing was done."
fi

if ! sudo test -f "/etc/letsencrypt/live/$domain/fullchain.pem"; then
  echo "==> No certificate for $domain yet: temporary http-only site"
  sudo tee "$available" >/dev/null <<EOF
# Temporary file, replaced by deploy/nginx/$domain.conf as soon as the certificate exists.
server {
    listen 80;
    listen [::]:80;
    server_name $domain;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 404; }
}
EOF
  sudo ln -sf "$available" "$enabled"
  sudo nginx -t
  sudo systemctl reload nginx

  echo "==> Issuing the certificate (own certificate, name $domain)"
  sudo certbot certonly --webroot -w /var/www/certbot -d "$domain" --cert-name "$domain" --non-interactive --agree-tos
else
  echo "==> The certificate for $domain already exists."
fi

echo "==> Installing the full nginx site"
sudo install -m 644 "nginx/$domain.conf" "$available"
sudo ln -sf "$available" "$enabled"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Done: $domain has its own certificate and is closed with a password."
sudo certbot certificates --cert-name "$domain" 2>/dev/null | grep -E 'Certificate Name|Domains|Expiry' || true
