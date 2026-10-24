#!/usr/bin/env bash
# Smoke test: waits until /health answers 200 AND reports the expected version.
# The version check matters: without it a 200 from the OLD container would look like a successful deploy.
#
# Usage: smoke.sh <health-url> <expected-version> [timeout-seconds] [extra curl args...]
set -euo pipefail

url=${1:?usage: smoke.sh <health-url> <expected-version> [timeout-seconds] [extra curl args...]}
expected=${2:?usage: smoke.sh <health-url> <expected-version> [timeout-seconds] [extra curl args...]}
timeout=${3:-60}
shift $(( $# < 3 ? $# : 3 ))

deadline=$((SECONDS + timeout))
last="no answer"

while true; do
  if body=$(curl --silent --show-error --fail --max-time 5 "$@" "$url" 2>&1); then
    last=$body
    version=$(printf '%s' "$body" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
    if [ "$version" = "$expected" ]; then
      echo "Smoke test passed: $url answered 200, version $version"
      exit 0
    fi
  else
    last=$body
  fi

  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Smoke test FAILED: $url did not report version $expected within ${timeout}s. Last answer: $last" >&2
    exit 1
  fi
  sleep 2
done
