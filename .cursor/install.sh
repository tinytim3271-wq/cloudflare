#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the MechPro repository.
set -eo pipefail

cd "$(dirname "$0")/.."

# Node 24 to match .github/workflows/cloudflare-pages.yml and AGENTS.md.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24 >/dev/null
nvm alias default 24 >/dev/null
nvm use 24 >/dev/null
echo "Using Node $(node -v) / npm $(npm -v)"

# Install dependencies and refresh the committed web bundle (app.js) from src/.
npm ci
npm run build:web

# Local-only diagnostics signing keypair (ECDSA P-256). The Worker signs
# /api/diagnostics/authorize capability tokens with the private key; the J2534
# host verifies with the public key only. Both are local dev keys, gitignored.
mkdir -p diagnostics/keys
DIAG_PRIV_KEY=""
if [ ! -f diagnostics/keys/diagnostics-private.local.pem ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out diagnostics/keys/diagnostics-private.local.pem
  openssl ec -in diagnostics/keys/diagnostics-private.local.pem -pubout \
    -out diagnostics/keys/diagnostics-public.local.pem 2>/dev/null
  echo "Generated local ECDSA P-256 diagnostics signing keypair"
fi
DIAG_PRIV_KEY="$(openssl pkcs8 -topk8 -nocrypt \
  -in diagnostics/keys/diagnostics-private.local.pem -outform DER | base64 | tr -d '\n')"

# Local-only Worker dev vars (uncommitted, gitignored family). Enables the
# documented DEV_AUTH_BYPASS flow so `wrangler dev` is usable without a real
# Cloudflare Access identity. Values are random local placeholders, never real.
if [ ! -f .dev.vars ]; then
  cat > .dev.vars <<EOF
DEV_AUTH_BYPASS=1
ACCESS_ADMIN_EMAILS=admin@demo-shop.com
INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 24)
DIAGNOSTICS_SIGNING_PRIVATE_KEY=$DIAG_PRIV_KEY
EOF
  echo "Created local .dev.vars for Worker development"
fi

# Apply D1 migrations to the local (miniflare) database used by `wrangler dev`.
npm run db:migrate:local
