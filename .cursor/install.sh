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

# Local-only Worker dev vars (uncommitted, gitignored family). Enables the
# documented DEV_AUTH_BYPASS flow so `wrangler dev` is usable without a real
# Cloudflare Access identity. Values are random local placeholders, never real.
if [ ! -f .dev.vars ]; then
  cat > .dev.vars <<EOF
DEV_AUTH_BYPASS=1
ACCESS_ADMIN_EMAILS=admin@demo-shop.com
INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 24)
DIAGNOSTICS_CAPABILITY_SECRET=$(openssl rand -hex 24)
EOF
  echo "Created local .dev.vars for Worker development"
fi

# Apply D1 migrations to the local (miniflare) database used by `wrangler dev`.
npm run db:migrate:local
