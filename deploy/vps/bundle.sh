#!/usr/bin/env bash
# Builds the release bundle every VPS installation is updated from
# (deploy/vps/melendos update): one generic web build (each installation adds
# its config.js), the Edge Functions with the self-hosted router, the
# migrations and the VPS files.
#
# Usage: deploy/vps/bundle.sh <version> [out dir]
#   → <out>/melendos-<version>.tar.gz and .sha256
set -euo pipefail
version=${1:?usage: bundle.sh <version> [out dir]}
out=${2:-dist-release}
[[ "$version" =~ ^v[0-9A-Za-z._-]+$ ]] || { echo "version must look like v1.2.3" >&2; exit 1; }
root=$(cd "$(dirname "$0")/../.." && pwd)
cd "$root"

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

# Generic web: nothing of any project baked in (src/lib/runtime-config.ts).
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= VITE_DEMO_ACCESS= \
  VITE_PLATFORM_DOMAIN= VITE_PLATFORM_CNAME= npm run build >/dev/null
if grep -rqE "sb_publishable_[A-Za-z0-9]|https://[a-z0-9]{20}\.supabase\.co" dist; then
  echo "the web build has a project baked in" >&2
  exit 1
fi
cp -r dist "$stage/web"

mkdir -p "$stage/functions/main"
tar -C supabase/functions --exclude='*.test.ts' -cf - . | tar -C "$stage/functions" -xf -
cp deploy/vps/instance/functions-main/index.ts "$stage/functions/main/index.ts"
cp deploy/vps/instance/functions-deno.jsonc "$stage/functions/deno.jsonc"

cp -r supabase/migrations "$stage/migrations"

mkdir -p "$stage/deploy"
cp -r deploy/vps/instance deploy/vps/proxy deploy/vps/tools deploy/vps/melendos "$stage/deploy/"

printf '%s\n%s\n' "$version" "$(git rev-parse HEAD 2>/dev/null || echo unknown)" >"$stage/VERSION"

mkdir -p "$out"
tar -C "$stage" -czf "$out/melendos-$version.tar.gz" .
(cd "$out" && sha256sum "melendos-$version.tar.gz" >"melendos-$version.tar.gz.sha256")
echo "$out/melendos-$version.tar.gz ($(du -h "$out/melendos-$version.tar.gz" | cut -f1))"
