# MechPro Dispatch

This repository, [`tinytim3271-wq/cloudflare`](https://github.com/tinytim3271-wq/cloudflare),
is the canonical home for MechPro.

MechPro is a local-first shop dispatch and work-order PWA with optional cloud
synchronization. The hosted application runs on Cloudflare today, and the target
public SaaS architecture is documented in
[`docs/cloudflare-saas-architecture.md`](docs/cloudflare-saas-architecture.md).

- **Pages** serves the static PWA.
- **Workers** provides the existing HTTP API routes under `/api`.
- **D1** stores tenant accounts, identity mappings, entities, audit events, and
  encrypted integration configuration.
- **R2** stores inspection photos, signatures, and Windows downloads.
- **Workers AI** powers `/api/ai/assistant` and AgentPhone responses.
- **Cloudflare Access** gates internal/operator surfaces; identity is injected
  as `Cf-Access-Jwt-Assertion` and mapped to a shop/role in D1.

The PWA remains usable offline with `localStorage` (`mechpro-dispatch-v1`) and
queues non-sensitive entity mutations until connectivity returns.

## Deployment Targets (Source of Truth)

| Target | Purpose | Source of truth |
| --- | --- | --- |
| Cloudflare Pages | Hosts the production web/PWA shell | `.github/workflows/cloudflare-pages.yml` |
| Cloudflare Worker | Hosts `/api/*` backend endpoints | `wrangler.jsonc`, `worker/` |
| Cloudflare R2 | Stores files/download artifacts | `.github/workflows/deploy-r2.yml`, `scripts/deploy-r2.sh` |
| Android APK | Builds Android package from Capacitor wrapper | `.github/workflows/android-apk.yml`, `android/` |
| Windows Desktop | Builds desktop installer and release artifacts | `.github/workflows/windows-desktop.yml`, `desktop/` |

## Local Development

### Setup

```bash
nvm use                          # Node 24 (see .nvmrc)
npm ci
cp .dev.vars.example .dev.vars   # only for local Worker development
```

`.cursor/install.sh` automates this for Cloud Agents: it pins Node 24, runs
`npm ci` + `npm run build:web`, generates a local ECDSA diagnostics signing key,
writes a working `.dev.vars`, and applies local D1 migrations.

### Run/build/test/lint

```bash
npm run dev --if-present     # esbuild watch (src/ -> app.js)
npm run build --if-present   # one-shot web bundle
npm run test --if-present    # test:config + test:worker + test:j2534
npm run lint --if-present    # ESLint over the modular src/ seams
npm run dev:worker           # wrangler dev (local Worker API)
```

`lint` runs ESLint across the modular `src/` entry/shared/runtime seams while
intentionally excluding the generated `app.js` bundle and the legacy runtime
monolith (`src/runtime/legacy.js`).

### Serve the local frontend shell

```bash
npm ci
npm run build:web
python -m http.server 3000 --bind 127.0.0.1
```

Open <http://127.0.0.1:3000/>. Localhost and packaged Electron builds use the
seeded admin profile for the offline UI. Cloud API requests remain protected.

Source lives in `src/`; `npm run build:web` refreshes committed `app.js`.

## Environment Variables

| Variable | Purpose | Scope |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Auth for Pages/Worker deploy and R2 publish actions | GitHub Actions (`cloudflare-pages.yml`, `windows-desktop.yml`) |
| `CLOUDFLARE_ACCOUNT_ID` | Selects target Cloudflare account in CI/deploy scripts | GitHub Actions + local deploy CLI |
| `CLOUDFLARE_D1_DATABASE_ID` | Optional CI override for Worker D1 binding `database_id` | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_PAGES_PROJECT` | Optional Pages project name override | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_APP_ORIGIN` | Optional smoke-check origin used by deploy verification (`/` + `/api/healthz`) | GitHub Actions variable |
| `CLOUDFLARE_ALLOWED_ORIGINS` | Optional Worker CORS origins override in CI deploy | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_DEPLOY_ENABLED` | Set to `false` to skip production Cloudflare publish | GitHub Actions variable |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | S3-compatible credentials for `deploy-r2.yml` uploads | GitHub Actions secrets (`deploy-r2.yml`) |
| `CLOUDFLARE_R2_BUCKET` (or `R2_BUCKET`) | Target R2 bucket for download/object uploads | GitHub Actions variable/secret (`deploy-r2.yml`, `windows-desktop.yml`) |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts integration secrets at rest in D1 | Worker secret (`wrangler secret put`) |
| `DIAGNOSTICS_SIGNING_PRIVATE_KEY` | ECDSA P-256 (PKCS#8 base64 DER) signing key for `/api/diagnostics/authorize` | Worker secret (`wrangler secret put`) / `.dev.vars` for local dev |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ADMIN_EMAILS` | Cloudflare Access/admin bootstrap for internal surfaces | Worker secrets / `.dev.vars` for local development |
| `DEV_AUTH_BYPASS` | Local-only auth bypass for `wrangler dev`; never production | `.dev.vars` local only |

## Release Process

1. Merge reviewed PRs to `main`.
2. Confirm baseline CI (`.github/workflows/ci.yml`) and target workflow(s) pass.
3. Deploy by target workflow (Pages/Worker/R2/Android/Windows).
4. Run smoke checks (see [`docs/OPERATIONS.md`](docs/OPERATIONS.md)) and verify `/api/healthz`.
5. Publish/verify target artifacts (APK, Windows installer) when applicable.

## Verification Steps

```bash
npm ci
npm run lint
npm test
npm run build:web
npm run validate:worker
```

`wrangler deploy --dry-run` (via `validate:worker`) validates Worker bundling
without changing remote resources. Remote Access policy behavior, D1 migrations,
R2 writes, AI inference, and webhooks still require a configured Cloudflare account.

## Cloudflare provisioning

Create the resources once. The production D1 `database_id` is already set in
`wrangler.jsonc`; only replace it when provisioning a new account or database:

```bash
npx wrangler login
npx wrangler d1 create mechpro
npx wrangler r2 bucket create mechpro-files
npx wrangler r2 bucket create mechpro-files-preview
```

Set Worker secrets interactively:

```bash
npx wrangler secret put INTEGRATION_ENCRYPTION_KEY
npx wrangler secret put DIAGNOSTICS_SIGNING_PRIVATE_KEY
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ACCESS_ADMIN_EMAILS
```

`INTEGRATION_ENCRYPTION_KEY` should be a generated high-entropy value.
`DIAGNOSTICS_SIGNING_PRIVATE_KEY` must be a PKCS#8 base64 DER ECDSA P-256 private
key used by `/api/diagnostics/authorize`; without it, authorize returns HTTP 503.
See [`diagnostics/keys/README.md`](diagnostics/keys/README.md) for key generation
and host public-key provisioning. `ACCESS_TEAM_DOMAIN` is the full team domain,
such as `https://example.cloudflareaccess.com`; `ACCESS_AUD` is the Access
application audience. `ACCESS_ADMIN_EMAILS` is a comma-separated bootstrap list
of platform administrators.

Apply schema and deploy:

```bash
npm run db:migrate:remote
npm run deploy:worker
npm run deploy:pages
```

Configure a Cloudflare Pages custom domain for `www.yourcarguy806.com` and keep
the Worker on the `/api/*` route only. Do not attach `mechpro-api` as a custom
domain for the whole hostname — that conflicts with Pages. Browser requests stay
same-origin: Pages serves the PWA and the Worker handles `/api`.

Keep Cloudflare Access in front of authenticated `/api/*` routes until app-owned
customer authentication is implemented; the Worker currently requires a
`Cf-Access-Jwt-Assertion` for those routes. Leave the PWA shell and
`/api/healthz` public, and disable Bot Fight challenges that block API clients.

After the bootstrap administrator signs in, create shops in **Platform
Administration**. Account creation maps the owner's identity email to the shop;
adding or editing an employee synchronizes that employee's email and role into D1.

For local Worker API development only, copy `.dev.vars.example` to an ignored
`.dev.vars` and fill in secrets:

```bash
cp .dev.vars.example .dev.vars
```

Then send `X-MechPro-Dev-Email` (and optionally `X-MechPro-Dev-Name`) on local
API requests. Never enable `DEV_AUTH_BYPASS` in production.

## API compatibility

The Worker preserves these routes:

- `/api/healthz`
- `/api/auth/session`
- `/api/entities/{type}[/{id}]`
- `/api/vehicles/decode/{vin}`
- `/api/diagnostics/coverage[/bundle]`, `/audit`, `/authorize`
- `/api/onboarding/start`, `/api/payroll/sync`, `/api/tax-report`
- `/api/ai/assistant`
- `/api/files/presign-upload`, `/upload`, `/presign-download`, `/object`
- `/api/payments/checkout-session`, `/api/payments/webhook/{shopId}`
- `/api/subscription/entitlement`
- `/api/agentphone/configure`, `/api/agentphone/webhook/{shopId}`
- `/api/admin/accounts` and account status/credit operations

The historical "presign" endpoints now return short Worker URLs backed by R2.
They intentionally do not expose R2 credentials. Webhook and provider secrets
are encrypted with AES-GCM before storage in D1. A platform administrator can
configure Stripe with:

```http
POST /api/admin/accounts/{shopId}/integrations/stripe
Content-Type: application/json

{"secretKey":"sk_live_...","webhookSecret":"whsec_..."}
```

Register `/api/payments/webhook/{shopId}` in Stripe. Registering AgentPhone from
the Settings screen stores its returned signing secret the same way.

## CI/CD

`.github/workflows/ci.yml` runs the baseline checks (lint, build, `app.js`
freshness, tests, Worker bundling validation) on pull requests and `main`.

`.github/workflows/cloudflare-pages.yml` validates the web bundle and Worker,
applies D1 migrations, deploys the Worker, and publishes Pages on `main`.
Configure these **Actions** credentials for the publish job. The job targets the
`production` environment, so environment secrets with the same names override
repository secrets:

- secret: `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, R2, and Pages edit)
- secret: `CLOUDFLARE_ACCOUNT_ID`
- variables: optional `CLOUDFLARE_DEPLOY_ENABLED=false` to skip publish,
  `CLOUDFLARE_D1_DATABASE_ID`, optional `CLOUDFLARE_PAGES_PROJECT`, and optional
  `CLOUDFLARE_ALLOWED_ORIGINS`

Publish runs on pushes to `main` and on manual **Run workflow** when
`CLOUDFLARE_API_TOKEN` is set, unless `CLOUDFLARE_DEPLOY_ENABLED` is `false`.
If the token is missing, validate still runs and publish is skipped instead of
failing the workflow. Worker runtime secrets are configured with
`wrangler secret put`, not GitHub variables.

`.github/workflows/deploy-r2.yml` publishes `downloads/` to R2 via the
S3-compatible API (`scripts/deploy-r2.sh`) using `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_R2_BUCKET`; it
skips cleanly when credentials are absent. The Windows workflow publishes
installers to the configured `CLOUDFLARE_R2_BUCKET` when the token is set.

Cloudflare API errors `10000` or `9109` mean the configured token is invalid or
lacks access to the account. Rotate both Actions secrets in the scope consumed by
the `production` job. Until CI is rotated, an account owner with an existing
Wrangler OAuth login can deploy from the repository root:

```bash
npm ci
npm run build:web
npm run db:migrate:remote
npm run deploy:worker
npm run deploy:pages
```

## Desktop and mobile

```bash
npm run sync                 # rebuild and sync Capacitor Android
npm run build:windows        # .NET J2534 host + Electron NSIS installer
```

The Windows J2534 native host is under `diagnostics/j2534-service/`. The optional
Python voice-intake sidecar is under `diagnostics/voice-service/`.
The packaged desktop shell remains local-first and does not bypass Cloudflare
Access. Use the hosted PWA for authenticated cloud synchronization.

## OEM diagnostics & programming

The OEM diagnostics module supports vehicle identification, DTC read/clear,
immobilizer key programming (add key, all-keys-lost, program remote, erase), and
UDS module reflash. Every mutating procedure is gated by a **capability token**:

1. The client calls `POST /api/diagnostics/authorize` with `{ vin, procedure }`.
2. The Worker signs an **ECDSA P-256** token (private key = `DIAGNOSTICS_SIGNING_PRIVATE_KEY`)
   scoped to that procedure/VIN/shop.
3. The J2534 host verifies the token with the **public key only** and executes
   the UDS sequence (SecurityAccess `0x27`, RoutineControl `0x31`, or
   RequestDownload/TransferData/RequestTransferExit `0x34/0x36/0x37`). Tokens are
   single-use and short-lived.

Modes:

- `simulate` — drives the built-in bench simulator (Node host). Always available;
  ideal for training and CI. No OEM credentials required. `/api/diagnostics/authorize`
  issues an ECDSA capability token for `clear_dtcs`, which the simulator host
  verifies and consumes (single-use).
- `live` — drives real hardware through the .NET host and requires a per-shop
  vehicle-security (AutoAuth) connection. That connection is **not** part of this
  change: mutating/live OEM procedures currently return HTTP `501`
  ("OEM AutoAuth integration is not configured"). Live execution also requires a
  licensed `ISecurityAccessProvider`. MechPro does **not** bundle or bypass OEM
  security-gateway seed/key algorithms; without a real provider, live
  SecurityAccess fails closed.

Signing keys are provisioned per [`diagnostics/keys/README.md`](diagnostics/keys/README.md)
(Worker secret for the private key; public key shipped to hosts). Local dev keys
are generated by `.cursor/install.sh`.

## Validation

```bash
npm run test:config
npm run test:worker
npm run validate:worker
npm run validate
```

`wrangler deploy --dry-run` validates Worker bundling without changing remote
resources. Remote Access policy behavior, D1 migrations, R2 writes, AI
inference, and webhooks still require a configured Cloudflare account.
