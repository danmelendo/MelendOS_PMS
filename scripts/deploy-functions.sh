#!/usr/bin/env bash
# Deploys every Edge Function one by one, retrying each up to 4 times.
# Supabase's deploy API sometimes answers 500 "Function deploy failed due to
# an internal error" for a single function; retrying it on its own works, so a
# transient error no longer fails the whole deploy.
# Usage: scripts/deploy-functions.sh <project-ref>
set -uo pipefail
ref="$1"
failed=()
for dir in supabase/functions/*/; do
  fn="$(basename "$dir")"
  [ "$fn" = "_shared" ] || [ ! -f "$dir/index.ts" ] && continue
  ok=""
  for attempt in 1 2 3 4; do
    if npx supabase functions deploy "$fn" --project-ref "$ref" --use-api; then
      ok=1
      break
    fi
    echo "::warning::$fn: deploy attempt $attempt failed, retrying"
    sleep $((attempt * 5))
  done
  [ -n "$ok" ] || failed+=("$fn")
done
if [ ${#failed[@]} -gt 0 ]; then
  echo "::error::Could not deploy: ${failed[*]}"
  exit 1
fi
