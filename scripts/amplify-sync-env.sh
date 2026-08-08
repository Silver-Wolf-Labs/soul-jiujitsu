#!/usr/bin/env bash
#
# Sync env vars from .env.local into the Amplify app.
#
# Secrets are written to a mode-600 temp file and passed via --cli-input-json
# so they never appear in argv (visible to `ps`) or in shell history.
# Only variable NAMES are printed, never values.
#
# Usage: scripts/amplify-sync-env.sh
#
set -euo pipefail

APP_ID="d3cz7iwwry6o0w"
REGION="us-east-1"
PROFILE="silverwolflabs"
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env.local"

# Vars to copy from .env.local as-is.
KEYS=(
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  SUPER_ADMIN_PASSWORD
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  CRON_SECRET
)

# Vars set to a deploy-specific value rather than the local one
# (localhost URLs must not reach the hosted build).
#
# This must be the live custom domain: publicOrigin() in src/lib/public-origin.ts
# prefers this over the x-forwarded-host headers, so a stale value here silently
# overrides the real host in Stripe redirects and password-reset links.
NEXT_PUBLIC_SITE_URL_OVERRIDE="https://souljiujitsucr.com"

[[ -f "$ENV_FILE" ]] || { echo "error: $ENV_FILE not found" >&2; exit 1; }

TMP="$(mktemp -t amplify-env)"
CURRENT="$(mktemp -t amplify-env-cur)"
chmod 600 "$TMP" "$CURRENT"
trap 'rm -f "$TMP" "$CURRENT"' EXIT

# Fetch existing vars and merge into them. update-app REPLACES the whole
# environmentVariables map, so a blind write would drop keys set elsewhere
# (notably _LIVE_UPDATES, which the console's repo-connection wizard adds).
aws amplify get-app \
  --app-id "$APP_ID" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query 'app.environmentVariables' \
  --output json > "$CURRENT"

ENV_FILE="$ENV_FILE" \
APP_ID="$APP_ID" \
CURRENT="$CURRENT" \
SITE_URL="$NEXT_PUBLIC_SITE_URL_OVERRIDE" \
KEYS="${KEYS[*]}" \
python3 <<'PY' > "$TMP"
import json, os, sys

env_path, app_id = os.environ["ENV_FILE"], os.environ["APP_ID"]
wanted = set(os.environ["KEYS"].split())

with open(os.environ["CURRENT"]) as fh:
    existing = json.load(fh) or {}

parsed = {}
with open(env_path) as fh:
    for line in fh:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip()
        # Strip matched surrounding quotes, if any.
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key in wanted and val:
            parsed[key] = val

parsed["NEXT_PUBLIC_SITE_URL"] = os.environ["SITE_URL"]

merged = {**existing, **parsed}
json.dump({"appId": app_id, "environmentVariables": merged}, sys.stdout)

print("  set: " + ", ".join(sorted(parsed)), file=sys.stderr)
preserved = sorted(existing.keys() - parsed.keys())
if preserved:
    print("  preserved: " + ", ".join(preserved), file=sys.stderr)

missing = sorted(wanted - parsed.keys())
if missing:
    print("  absent from .env.local (skipped): " + ", ".join(missing), file=sys.stderr)
PY

aws amplify update-app \
  --region "$REGION" \
  --profile "$PROFILE" \
  --cli-input-json "file://$TMP" \
  --query 'app.environmentVariables | keys(@)' \
  --output text

echo "Done. Values were not printed."
