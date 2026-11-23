#!/usr/bin/env bash
# Runs on the GitHub runner (not on the server): sets up ssh so that "ssh server ..." reaches the VPS with the deploy key.
# Settings come from the environment (CI takes them from GitHub secrets and variables):
#   DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS, DEPLOY_HOST, DEPLOY_USER
set -euo pipefail

: "${DEPLOY_SSH_KEY:?DEPLOY_SSH_KEY is not set}"
: "${DEPLOY_KNOWN_HOSTS:?DEPLOY_KNOWN_HOSTS is not set}"
: "${DEPLOY_HOST:?DEPLOY_HOST is not set}"
: "${DEPLOY_USER:?DEPLOY_USER is not set}"

install -m 700 -d ~/.ssh
printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy_key
chmod 600 ~/.ssh/deploy_key
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
cat > ~/.ssh/config <<CONFIG
Host server
  HostName $DEPLOY_HOST
  User $DEPLOY_USER
  IdentityFile ~/.ssh/deploy_key
  IdentitiesOnly yes
  StrictHostKeyChecking yes
CONFIG
