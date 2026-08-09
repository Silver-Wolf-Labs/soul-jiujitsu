#!/usr/bin/env bash
#
# Register souljiujitsucr.com as a Resend sending domain and publish the
# SPF/DKIM records it returns into Route53.
#
# WHY A SCRIPT AND NOT A DASHBOARD WALKTHROUGH: the records Resend issues include
# a DKIM public key — a ~400-character base64 blob. Hand-copying that into the
# Route53 console is the single most likely step to fail in this whole setup, and
# it fails SILENTLY: a truncated key leaves the domain permanently "pending" and
# every email lands in spam with no error anywhere. Reading the values from the
# API and writing them with the API removes the transcription entirely.
#
# Idempotent. Re-running it re-reads the domain's current records and UPSERTs
# them, so it is also the way to repair drift after someone edits DNS by hand.
#
# Usage:
#   RESEND_API_KEY=re_xxx scripts/resend-setup-dns.sh            # apply
#   RESEND_API_KEY=re_xxx scripts/resend-setup-dns.sh --dry-run  # show, change nothing
#
# The key is read from the environment and never printed, never written to disk,
# and never passed as an argv element (visible to `ps`) — the same discipline as
# scripts/amplify-sync-env.sh. Prefix the command with a space, or use a leading
# `read -rs`, to keep it out of shell history.
set -euo pipefail

DOMAIN="souljiujitsucr.com"
ZONE_ID="Z000246726D35SM6MBXFI"
REGION="us-east-1"          # Resend sending region; also the AWS region for the CLI
PROFILE="silverwolflabs"
DRY_RUN=0

[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

: "${RESEND_API_KEY:?set RESEND_API_KEY (create one at https://resend.com/api-keys)}"

command -v jq >/dev/null || { echo "error: jq is required" >&2; exit 1; }

# ── Find or create the domain in Resend ─────────────────────────────────────
#
# GET first: POST /domains on an existing name returns 422, and treating "already
# set up" as a failure would make the script single-use. The whole point is that
# it can be re-run.
say() { printf '%s\n' "$*" >&2; }

api() {
  # $1 = method, $2 = path, $3 = optional JSON body.
  # --fail-with-body so a 4xx still shows Resend's error message instead of "".
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS --fail-with-body -X "$method" "https://api.resend.com${path}" \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$body"
  else
    curl -sS --fail-with-body -X "$method" "https://api.resend.com${path}" \
      -H "Authorization: Bearer ${RESEND_API_KEY}"
  fi
}

say "Looking up ${DOMAIN} in Resend…"
DOMAIN_ID="$(api GET /domains | jq -r --arg d "$DOMAIN" '.data[]? | select(.name == $d) | .id' | head -1)"

if [[ -z "$DOMAIN_ID" || "$DOMAIN_ID" == "null" ]]; then
  say "Not found — creating it (region ${REGION})."
  DOMAIN_ID="$(api POST /domains "$(jq -nc --arg n "$DOMAIN" --arg r "$REGION" \
    '{name: $n, region: $r}')" | jq -r '.id')"
  [[ -n "$DOMAIN_ID" && "$DOMAIN_ID" != "null" ]] || { say "error: could not create domain"; exit 1; }
  say "Created: ${DOMAIN_ID}"
else
  say "Found existing: ${DOMAIN_ID}"
fi

RECORDS="$(api GET "/domains/${DOMAIN_ID}")"
say "Domain status: $(jq -r '.status // "unknown"' <<<"$RECORDS")"

# ── Translate Resend's records into a Route53 change batch ──────────────────
#
# Two things here are load-bearing and easy to get wrong by hand:
#
#   1. TXT values must be enclosed in double quotes in Route53, and a single
#      quoted string cannot exceed 255 characters. DKIM keys DO exceed it. The
#      DNS wire format allows a TXT record to be several concatenated strings,
#      so long values are split into 255-char chunks — "abc…" "…xyz" — which
#      resolvers rejoin. Omitting the split gets a hard API error; omitting the
#      quotes gets a record that silently doesn't match.
#
#   2. Resend returns `name` sometimes relative ("send") and sometimes absolute
#      ("send.souljiujitsucr.com"). Appending the domain unconditionally would
#      produce send.souljiujitsucr.com.souljiujitsucr.com, which is a valid
#      record that never resolves. So append only when it isn't already there.
BATCH="$(jq -c --arg domain "$DOMAIN" '
  def fqdn:
    if . == "" or . == null then $domain
    elif . == "@" then $domain
    elif endswith($domain) then .
    else . + "." + $domain end;

  # Split a string into <=255-char chunks and wrap each in quotes.
  def chunk_txt:
    . as $s
    | [range(0; ($s | length); 255) | $s[. : . + 255]]
    | map("\"" + . + "\"")
    | join(" ");

  [ .records[]?
    | {
        Action: "UPSERT",
        ResourceRecordSet: (
          {
            Name: (.name | tostring | fqdn),
            Type: .type,
            TTL: (.ttl // "Auto" | if type == "number" then . else 300 end),
            ResourceRecords: [{
              Value: (
                if .type == "TXT" then (.value | chunk_txt)
                elif .type == "MX" then ((.priority // 10 | tostring) + " " + .value)
                else .value end
              )
            }]
          }
        )
      }
  ]' <<<"$RECORDS")"

COUNT="$(jq 'length' <<<"$BATCH")"
[[ "$COUNT" -gt 0 ]] || { say "error: Resend returned no DNS records"; exit 1; }

say ""
say "${COUNT} record(s) from Resend:"
jq -r '.[] | "  \(.ResourceRecordSet.Type)\t\(.ResourceRecordSet.Name)"' <<<"$BATCH" >&2

# ── DMARC ───────────────────────────────────────────────────────────────────
#
# Resend does not issue this one; it is the policy record that tells receivers
# what to do when SPF and DKIM disagree, and without it Gmail treats a new
# sending domain with more suspicion.
#
# p=none DELIBERATELY, unlike brumacollective.com which is on p=quarantine.
# p=none means "monitor, don't act": if DKIM is still propagating, legitimate
# signup mail is delivered rather than silently quarantined. Tighten to
# p=quarantine once the domain has been verified and sending cleanly for a
# couple of weeks — that is a one-line change here, re-run the script.
DMARC='v=DMARC1; p=none; rua=mailto:dmarc@souljiujitsucr.com; adkim=r; aspf=r; fo=1; pct=100'
BATCH="$(jq -c --arg name "_dmarc.${DOMAIN}" --arg v "\"${DMARC}\"" \
  '. + [{Action: "UPSERT", ResourceRecordSet: {Name: $name, Type: "TXT", TTL: 300,
         ResourceRecords: [{Value: $v}]}}]' <<<"$BATCH")"
say "  TXT\t_dmarc.${DOMAIN}  (p=none — monitor only)"

if [[ "$DRY_RUN" == 1 ]]; then
  say ""
  say "--dry-run: nothing was written. Change batch:"
  jq . <<<"$BATCH"
  exit 0
fi

# ── Apply ───────────────────────────────────────────────────────────────────
#
# Written to a temp file rather than passed inline: a DKIM batch comfortably
# exceeds the argv length that is comfortable to pass, and this keeps the
# invocation readable in `ps`.
TMP="$(mktemp -t resend-dns)"
chmod 600 "$TMP"
trap 'rm -f "$TMP"' EXIT
jq -nc --argjson c "$BATCH" '{Comment: "Resend sending domain", Changes: $c}' > "$TMP"

say ""
say "Applying to Route53 zone ${ZONE_ID}…"
CHANGE_ID="$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --change-batch "file://$TMP" \
  --profile "$PROFILE" \
  --query 'ChangeInfo.Id' --output text)"
say "Submitted: ${CHANGE_ID}"

say "Waiting for the change to propagate to all Route53 nameservers…"
aws route53 wait resource-record-sets-changed --id "$CHANGE_ID" --profile "$PROFILE"
say "DNS is live."

# ── Ask Resend to verify ────────────────────────────────────────────────────
#
# Verification is asynchronous on Resend's side; this only kicks it off. The
# domain typically flips to "verified" within a few minutes of the records
# resolving, and the dashboard is the place to confirm it.
say ""
say "Triggering Resend verification…"
api POST "/domains/${DOMAIN_ID}/verify" >/dev/null || say "  (verify request failed — retry from the Resend dashboard)"
sleep 5
say "Status now: $(api GET "/domains/${DOMAIN_ID}" | jq -r '.status // "unknown"')"
say ""
say "Next: put the SMTP credentials into Supabase"
say "  Authentication → Emails → SMTP Settings (project fosgqmiqqdrrgoqghcgc)"
say "  host smtp.resend.com   port 587   user resend   pass <the same RESEND_API_KEY>"
say "  sender noreply@${DOMAIN}   name 'Soul Jiu Jitsu'"
say "Then raise Authentication → Rate Limits → emails per hour from 2 to 30."
