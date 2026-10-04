#!/usr/bin/env bash
# Publish download/object artifacts to Cloudflare R2 via the S3-compatible API.
# Requires: aws CLI, and these env vars:
#   R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY   (S3-compatible credentials)
#   CLOUDFLARE_ACCOUNT_ID                    (selects the R2 endpoint)
#   CLOUDFLARE_R2_BUCKET (or R2_BUCKET)      (target bucket)
# Optional: R2_SOURCE_DIR (default: downloads/), R2_DEST_PREFIX (default: downloads/)
#           DRY_RUN=1 to preview with `aws s3 sync --dryrun`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${R2_SOURCE_DIR:-$ROOT/downloads}"
DEST_PREFIX="${R2_DEST_PREFIX:-downloads/}"
BUCKET="${CLOUDFLARE_R2_BUCKET:-${R2_BUCKET:-}}"
ACCOUNT="${CLOUDFLARE_ACCOUNT_ID:-}"

: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
[ -n "$BUCKET" ] || { echo "CLOUDFLARE_R2_BUCKET (or R2_BUCKET) is required" >&2; exit 1; }
[ -n "$ACCOUNT" ] || { echo "CLOUDFLARE_ACCOUNT_ID is required" >&2; exit 1; }
[ -d "$SRC" ] || { echo "Source directory not found: $SRC" >&2; exit 1; }
command -v aws >/dev/null 2>&1 || { echo "aws CLI is required (install awscli)" >&2; exit 1; }

ENDPOINT="https://${ACCOUNT}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

sync_args=(s3 sync "$SRC" "s3://${BUCKET}/${DEST_PREFIX}" --endpoint-url "$ENDPOINT" --no-progress)
[ "${DRY_RUN:-0}" = "1" ] && sync_args+=(--dryrun)

echo "Publishing ${SRC} -> s3://${BUCKET}/${DEST_PREFIX} via ${ENDPOINT}"
aws "${sync_args[@]}"
echo "R2 publish complete."
