#!/bin/sh
# Writes an installation's config.js (read by src/lib/runtime-config.ts), so
# every installation serves the same web build. Run it again after changing
# the installation's .env; no restart needed (Caddy serves it uncached).
#
# Usage: web-config.sh /opt/melendos/instances/<instance>
# Reads from <instance>/.env: SUPABASE_PUBLIC_URL, SUPABASE_PUBLISHABLE_KEY,
# PANEL_HOST and, optionally, PLATFORM_DOMAIN and PLATFORM_CNAME.
set -eu
dir="${1:?usage: web-config.sh <instance dir>}"
get() { sed -n "s/^$1=//p" "$dir/.env" | tail -n 1; }

jq -n \
  --arg supabaseUrl "$(get SUPABASE_PUBLIC_URL)" \
  --arg supabaseKey "$(get SUPABASE_PUBLISHABLE_KEY)" \
  --arg panelHost "$(get PANEL_HOST)" \
  --arg platformDomain "$(get PLATFORM_DOMAIN)" \
  --arg platformCname "$(get PLATFORM_CNAME)" \
  '{supabaseUrl: $supabaseUrl, supabaseKey: $supabaseKey, panelHost: $panelHost,
    platformDomain: $platformDomain, platformCname: $platformCname, demoAccess: false}
   | with_entries(select(.value != ""))' \
  | { printf 'window.__MELENDOS__ = '; cat; printf ';\n'; } > "$dir/config.js.tmp"
mv "$dir/config.js.tmp" "$dir/config.js"
echo "Written $dir/config.js"
