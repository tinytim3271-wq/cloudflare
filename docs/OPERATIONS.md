# MechPro Operations

Operational runbook for deploying and verifying MechPro on Cloudflare.

## Deployment targets

| Target | Purpose | Source of truth |
| --- | --- | --- |
| Cloudflare Pages | Production web/PWA shell | `.github/workflows/cloudflare-pages.yml` |
| Cloudflare Worker | `/api/*` backend | `wrangler.jsonc`, `worker/` |
| Cloudflare R2 | File/download artifacts | `.github/workflows/deploy-r2.yml`, `scripts/deploy-r2.sh` |
| Android APK | Capacitor wrapper build | `.github/workflows/android-apk.yml`, `android/` |
| Windows Desktop | Electron installer | `.github/workflows/windows-desktop.yml`, `desktop/` |

## Release process

1. Merge reviewed PRs to `main`.
2. Confirm baseline CI (`.github/workflows/ci.yml`) is green: lint, build, tests,
   and `validate:worker` must pass.
3. Deploy the relevant target workflow (Pages/Worker publish via
   `cloudflare-pages.yml`; R2 via `deploy-r2.yml`; Android/Windows as needed).
   Publishing conditions are workflow-specific: Pages publishes only on `main`
   pushes when `CLOUDFLARE_DEPLOY_ENABLED` is `true`; R2 skips when it is `false`
   or S3 credentials are absent; Windows publishing currently requires credentials.
4. Run smoke checks (below).
5. Publish/verify target artifacts (APK, Windows installer) when applicable.

## Smoke checks

Replace the host with the deployed origin (`CLOUDFLARE_APP_ORIGIN`).

```bash
# API liveness — must return JSON, not a Cloudflare challenge page
curl -sS https://www.yourcarguy806.com/api/healthz
# Expected: {"ok":true,"service":"mechpro-cloudflare-api"}

# PWA shell loads
curl -sS -o /dev/null -w '%{http_code}\n' https://www.yourcarguy806.com/
# Expected: 200
```

If `/api/healthz` returns an HTML "Just a moment..." challenge, configure that
health endpoint as public/bypassed and disable Bot Fight challenges that block
API clients. Keep Access on authenticated API routes until replacement auth exists.

## Secrets and rotation

Worker runtime secrets are set with `wrangler secret put` (never GitHub vars):

- `INTEGRATION_ENCRYPTION_KEY` — AES-GCM key for integration secrets in D1.
- `DIAGNOSTICS_SIGNING_PRIVATE_KEY` — ECDSA P-256 (PKCS#8 base64 DER) signing
  key for `/api/diagnostics/authorize`. Rotate together with every J2534 host's
  `MECHPRO_DIAG_SIGNING_PUBLIC_KEY`; see `diagnostics/keys/README.md`.
- Access/admin bootstrap: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ADMIN_EMAILS`.

GitHub Actions credentials for publish jobs (`production` environment):

- secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and for R2
  `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
- variables: `CLOUDFLARE_DEPLOY_ENABLED`, `CLOUDFLARE_D1_DATABASE_ID`,
  `CLOUDFLARE_PAGES_PROJECT`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_ALLOWED_ORIGINS`,
  `CLOUDFLARE_APP_ORIGIN`.

Cloudflare API errors `10000`/`9109` mean the token is invalid or lacks account
access — rotate the Actions secrets in the `production` scope.

## Rollback

- Worker: `wrangler rollback` (or redeploy the last known-good commit via the
  Pages/Worker workflow).
- Pages: promote a previous deployment in the Cloudflare dashboard, or re-run
  the deploy workflow on the last known-good commit.
- D1 migrations are additive; coordinate schema rollbacks with a new migration
  rather than reverting applied ones.

## Local verification

```bash
nvm use           # Node 24 (see .nvmrc)
npm ci
npm run lint
npm test          # test:config + test:worker + test:j2534
npm run build:web
npm run validate:worker
```

For local Worker + API work, `.cursor/install.sh` provisions `.dev.vars`
(including a local diagnostics signing key) and applies local D1 migrations;
then run `npm run dev:worker` and serve the shell with
`python -m http.server 3000 --bind 127.0.0.1`.
