# MechPro Dispatch

MechPro is a local-first shop dispatch and work-order PWA with optional cloud
synchronization. The hosted application runs on Cloudflare today, and the target
public SaaS architecture is documented in
[`docs/cloudflare-saas-architecture.md`](docs/cloudflare-saas-architecture.md).
The app now supports a public customer-auth path using the `mechpro_session`
HTTP-only cookie, with magic-link sign-in endpoints at
`/api/auth/magic-link`, `/api/auth/callback`, and `/api/auth/logout`.
- **Pages** serves the static PWA.
- **Workers** provides the existing HTTP API routes under `/api`.
- **D1** stores tenant accounts, identity mappings, entities, audit events, and
  encrypted integration configuration.
- **R2** stores inspection photos, signatures, and Windows downloads.
- **Workers AI** powers `/api/ai/assistant` and AgentPhone responses.
- **Cloudflare Access** should be reserved for internal/operator surfaces as the
  product moves to public SaaS signup, login, and billing.

The PWA remains usable offline with `localStorage` (`mechpro-dispatch-v1`) and
queues non-sensitive entity mutations until connectivity returns.

## Deployment Targets (Source of Truth)

| Target | Purpose | Source of truth |
| --- | --- | --- |
| Cloudflare Pages | Hosts the production web/PWA shell | `.github/workflows/cloudflare-pages.yml` |
| Cloudflare Worker | Hosts `/api/*` backend endpoints | `wrangler.jsonc`, `worker/` |
| Cloudflare R2 | Stores files/download artifacts | `.github/workflows/deploy-r2.yml` |
| Android APK | Builds Android package from Capacitor wrapper | `.github/workflows/android-apk.yml`, `android/` |
| Windows Desktop | Builds desktop installer and release artifacts | `.github/workflows/windows-desktop.yml`, `desktop/` |

`amplify.yml` was removed as a legacy configuration to prevent deployment-source drift; active deployment paths are Cloudflare workflows and `wrangler.jsonc`.

## Local Development

### Setup

```bash
nvm use
npm ci
cp .dev.vars.example .dev.vars   # only for local Worker development
```

### Run/build/test/lint

```bash
npm run dev --if-present
npm run build --if-present
npm run test --if-present
npm run lint --if-present
npm run dev:worker --if-present
```

`lint` runs ESLint across the modular `src/` entry/shared/runtime seams while intentionally excluding generated `app.js` and the current legacy runtime monolith file.

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
| `CLOUDFLARE_API_TOKEN` | Auth for Pages/Worker deploy and R2 publish actions | GitHub Actions (`cloudflare-pages.yml`, `windows-desktop.yml`, optional `deploy-r2.yml`) |
| `CLOUDFLARE_ACCOUNT_ID` | Selects target Cloudflare account in CI/deploy scripts | GitHub Actions + local deploy CLI |
| `CLOUDFLARE_D1_DATABASE_ID` | Optional CI override for Worker D1 binding `database_id` | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_PAGES_PROJECT` | Optional Pages project name override | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_APP_ORIGIN` | Optional smoke-check origin used by deploy verification (`/` + `/api/healthz`) | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_ALLOWED_ORIGINS` | Optional Worker CORS origins override in CI deploy | GitHub Actions variable (`cloudflare-pages.yml`) |
| `CLOUDFLARE_DEPLOY_ENABLED` | Set to `false` to skip production Cloudflare publish | GitHub Actions variable (`cloudflare-pages.yml`) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | S3-compatible credentials for `deploy-r2.yml` uploads | GitHub Actions secrets (`deploy-r2.yml`) |
| `CLOUDFLARE_R2_BUCKET` (or `R2_BUCKET`) | Target R2 bucket for download/object uploads | GitHub Actions variable/secret (`deploy-r2.yml`, `windows-desktop.yml`) |
| `INTEGRATION_ENCRYPTION_KEY` | Encrypts integration secrets at rest in D1 | Worker secret (`wrangler secret put`) |
| `DIAGNOSTICS_SIGNING_PRIVATE_KEY` | Required ECDSA signing key for `/api/diagnostics/authorize` | Worker secret (`wrangler secret put`) |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_ADMIN_EMAILS` | Cloudflare Access/admin bootstrap for internal surfaces | Worker secrets / `.dev.vars` for local development |
| `DEV_AUTH_BYPASS` | Local-only auth bypass for `wrangler dev`; never production | `.dev.vars` local only |

## Release Process

1. Merge reviewed PRs to `main`.
2. Confirm baseline CI (`.github/workflows/ci.yml`) and target workflow(s) pass.
3. Deploy by target workflow (Pages/Worker/R2/Android/Windows).
4. Run smoke checks (see `docs/OPERATIONS.md`) and verify `/api/healthz`.
5. Publish/verify target artifacts (APK, Windows installer) when applicable.

## Verification Steps

```bash
npm ci
npm run test --if-present
npm run build --if-present
npm run validate:worker --if-present
```

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
npx wrangler secret put AUTH_EMAIL_WEBHOOK
npx wrangler secret put AUTH_EMAIL_WEBHOOK_SECRET
npx wrangler secret put STRIPE_BILLING_WEBHOOK_SECRET
```

`INTEGRATION_ENCRYPTION_KEY` should be a generated high-entropy value.
`DIAGNOSTICS_SIGNING_PRIVATE_KEY` must be a PKCS#8 base64 DER ECDSA P-256 private
key used by `/api/diagnostics/authorize`; without it, authorize returns HTTP 503.
`ACCESS_TEAM_DOMAIN` is the full team domain, such as
`https://example.cloudflareaccess.com`; `ACCESS_AUD` is the Access application
audience. `ACCESS_ADMIN_EMAILS` is a comma-separated bootstrap list of platform
administrators. `AUTH_EMAIL_WEBHOOK` must be configured as a Worker secret
pointing to a trusted transactional-email service that accepts `{ email,
loginUrl, returnTo }`; its optional bearer secret is stored as
`AUTH_EMAIL_WEBHOOK_SECRET`. Login links are never returned by the production
API. `STRIPE_BILLING_WEBHOOK_SECRET` is the signing secret for the SaaS
subscription webhook endpoint.

### Fixing email sign-in

Sign-in mail is sent by this Worker. `POST /api/auth/send-login` accepts
`{ email, loginUrl, returnTo }`, checks the bearer secret, and returns HTTP 202
only after Cloudflare Email accepts the message. Its address is:

`https://www.yourcarguy806.com/api/auth/send-login`

Enable Email Routing for `yourcarguy806.com`, then deploy `mechpro-api`. After
that deploy, magic-link sign-in uses the `EMAIL` binding directly. Until then,
point `AUTH_EMAIL_WEBHOOK` at the address above. `Unable to deliver the sign-in
email` means the current webhook did not accept the message.

The guided setup command is:

```bash
npm run setup:email
```

The script explains each step, asks for confirmation before saving anything, and
stores the values as **remote Worker secrets** through Wrangler. Your
administrator needs an **HTTPS** webhook endpoint that accepts MechPro's JSON
payload:

```json
{ "email": "customer@example.com", "loginUrl": "https://example.com/api/auth/callback?token=...", "returnTo": "/" }
```

If your webhook needs bearer authentication, the same guided flow can also store
`AUTH_EMAIL_WEBHOOK_SECRET`.

Important:

- **Production sign-in uses remote Worker secrets**, not local `.dev.vars`.
- `.dev.vars` is only for local `wrangler dev` testing on your own machine.
- **Do not enable `AUTH_EXPOSE_LOGIN_LINK=1` in production.** That bypass returns
  the magic sign-in link directly instead of proving email ownership.

After the script saves the secret, deploy the Worker:

```bash
npm run deploy:worker
```

Simple verification:

1. Open your MechPro site and visit `/login`.
2. Request a sign-in link with an email address you control.
3. Confirm your webhook receives `{ email, loginUrl, returnTo }`.
4. Confirm the email arrives and that the login link signs you in.

Apply schema and deploy:

```bash
npm run db:migrate:remote
npm run deploy:worker
npm run deploy:pages
```

Configure a Cloudflare Pages custom domain for `www.yourcarguy806.com` and keep
the Worker on the `/api/*` route only. Do not attach `mechpro-api` as a custom
domain for the whole hostname — that conflicts with Pages and is why production
deploys fail. Browser requests stay same-origin: Pages serves the PWA and marketing
pages, and the Worker handles `/api`.

Do not put Cloudflare Access or Bot Fight Mode / Super Bot Fight Mode in front of
the public hostname. Those challenges currently return HTTP 403 "Just a moment..."
for `https://www.yourcarguy806.com/` and `/api/*`, which blocks the PWA and API
clients. Reserve Access for an internal admin hostname. Confirm the Worker route
with `curl -sS https://www.yourcarguy806.com/api/healthz` — it should return JSON
`{"ok":true,"service":"mechpro-cloudflare-api"}`, not a Cloudflare challenge page.

After an owner signs in with a magic-link from `/login`, create shops in
**Platform Administration**. Account creation maps the owner's email to the
shop; adding or editing an employee synchronizes that employee's email and role
into D1.

For local Worker API development only, copy `.dev.vars.example` to an ignored
`.dev.vars` and fill in secrets:

```bash
cp .dev.vars.example .dev.vars
```

Then send `X-MechPro-Dev-Email` (and optionally `X-MechPro-Dev-Name`) on local
API requests. Never enable `DEV_AUTH_BYPASS` in production.

## API compatibility

The Worker preserves these routes:

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

The historical “presign” endpoints now return short Worker URLs backed by R2.
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

`.github/workflows/cloudflare-pages.yml` validates the web bundle and Worker,
applies D1 migrations, deploys the Worker, and publishes Pages on `main`.
Configure these **Actions** credentials for the publish job. The job targets the
`production` environment, so environment secrets with the same names override
repository secrets:

- secret: `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, R2, and Pages edit)
- secret: `CLOUDFLARE_ACCOUNT_ID` (`0c31efca6f8739ca301b222f3d68cff4`)
- variables: optional `CLOUDFLARE_DEPLOY_ENABLED=false` to skip publish,
  `CLOUDFLARE_D1_DATABASE_ID`, optional `CLOUDFLARE_PAGES_PROJECT`, and optional
  `CLOUDFLARE_ALLOWED_ORIGINS`

Publish runs on pushes to `main` and on manual **Run workflow** when
`CLOUDFLARE_API_TOKEN` is set, unless `CLOUDFLARE_DEPLOY_ENABLED` is `false`.
If the token is missing, validate still runs and publish is skipped instead of
failing the workflow. Worker runtime secrets are configured with
`wrangler secret put`, not GitHub variables. The Windows workflow publishes
installers to the configured `CLOUDFLARE_R2_BUCKET` when the same token is set.

Cloudflare API errors `10000` or `9109` mean the configured token is invalid or
lacks access to the account. Rotate both Actions secrets above in the scope
consumed by the `production` job; do not copy an OAuth token from a developer
machine into GitHub. Until CI is rotated, an account owner with an existing
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

1. The client calls `POST /api/diagnostics/authorize` with `{ vin, procedure, mode }`.
2. The Worker signs an **ECDSA P-256** token (private key = `DIAGNOSTICS_SIGNING_PRIVATE_KEY`)
   scoped to that procedure/VIN/shop/mode, and records an authorization audit row.
3. The J2534 host verifies the token with the **public key only** and executes
   the UDS sequence (SecurityAccess `0x27`, RoutineControl `0x31`, or
   RequestDownload/TransferData/RequestTransferExit `0x34/0x36/0x37`). Tokens are
   single-use and short-lived.

Modes:

- `simulate` — drives the built-in bench simulator (Node host). Always available;
  ideal for training and CI. No OEM credentials required.
- `live` — drives real hardware through the .NET host. Each shop connects its
  **own** vehicle-security (AutoAuth) login, which is what unlocks live
  immobilizer/programming/flash for that shop:
  - `GET /api/diagnostics/autoauth` — connection status (no secrets returned).
  - `POST /api/diagnostics/autoauth` — connect `{ provider, accountId, apiKey }`
    (shop admin only; credentials encrypted at rest in D1, per-shop).
  - `DELETE /api/diagnostics/autoauth` — disconnect.

  Until the shop is connected, live authorization returns `501`. Live execution
  also requires a licensed `ISecurityAccessProvider`. MechPro does **not** bundle
  or bypass OEM security-gateway seed/key algorithms; without a real provider,
  live SecurityAccess fails closed.

Signing keys are provisioned per `diagnostics/keys/README.md` (Worker secret for
the private key; public key shipped to hosts). Local dev keys are generated by
`.cursor/install.sh`.

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
