#!/usr/bin/env bash
# Runs on the GitHub runner (not on the server), in "Deploy prod": decides which commit goes to prod.
# Only a commit that was rolled out to the test stand successfully (a green "Deploy staging" run) may go to prod.
#
# Settings come from the environment: GH_TOKEN, GITHUB_REPOSITORY, and
#   INPUT_SHA  the commit typed by hand (full or short); empty = the commit of the latest green test stand rollout
# Prints the choice and writes "sha=" and "image=" to $GITHUB_OUTPUT when it is set.
set -euo pipefail

staging_workflow=deploy-staging.yml

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

repo=${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set}
input=$(printf '%s' "${INPUT_SHA:-}" | tr -d '[:space:]')

if [ -z "$input" ]; then
  sha=$(gh run list --repo "$repo" --workflow "$staging_workflow" --branch main --status success --limit 1 \
    --json headSha --jq '.[0].headSha // empty')
  if [ -z "$sha" ]; then
    fail "there is no green \"Deploy staging\" run yet, so there is nothing to roll out to prod. Merge to main and wait for the test stand."
  fi
  echo "SHA field is empty: taking the commit of the latest green test stand rollout."
else
  if ! [[ $input =~ ^[0-9a-fA-F]{7,40}$ ]]; then
    fail "\"$input\" is not a commit SHA (7 to 40 hex characters). Nothing was rolled out."
  fi
  if ! sha=$(gh api "repos/$repo/commits/$input" --jq .sha 2>/dev/null) || [ -z "$sha" ]; then
    fail "commit $input was not found in $repo. Nothing was rolled out."
  fi
  runs=$(gh run list --repo "$repo" --workflow "$staging_workflow" --commit "$sha" --status success --limit 1 \
    --json databaseId --jq 'length')
  if [ "$runs" -lt 1 ]; then
    fail "commit $sha has no green \"Deploy staging\" run: it was not rolled out to the test stand successfully, so it cannot go to prod. Nothing was rolled out."
  fi
  echo "SHA typed by hand: it passed the test stand."
fi

image="ghcr.io/${repo,,}:$sha"
echo "Commit for prod: $sha"
echo "Image: $image"

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "sha=$sha"
    echo "image=$image"
  } >> "$GITHUB_OUTPUT"
fi
