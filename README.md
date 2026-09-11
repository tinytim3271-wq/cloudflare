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

## Local frontend

```bash
npm ci
npm run build:web
python -m http.server 3000 --bind 127.0.0.1
```

Open <http://127.0.0.1:3000/>. Localhost and packaged Electron builds use the
seeded admin profile for the offline UI. Cloud API requests remain protected.

Source lives in `src/`; `npm run build:web` refreshes committed `app.js`.

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
npx wrangler secret put DIAGNOSTICS_CAPABILITY_SECRET
npx wrangler secret put ACCESS_TEAM_DOMAIN
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ACCESS_ADMIN_EMAILS
```

`INTEGRATION_ENCRYPTION_KEY` should be a generated high-entropy value.
`ACCESS_TEAM_DOMAIN` is the full team domain, such as
`https://example.cloudflareaccess.com`; `ACCESS_AUD` is the Access application
audience. `ACCESS_ADMIN_EMAILS` is a comma-separated bootstrap list of platform
administrators.

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
Configure repository **Actions** credentials (not the unused `production`
environment):

- secret: `CLOUDFLARE_API_TOKEN` (Workers Scripts, D1, R2, and Pages edit)
- variable or secret: `CLOUDFLARE_ACCOUNT_ID`
- variables: optional `CLOUDFLARE_DEPLOY_ENABLED=false` to skip publish,
  `CLOUDFLARE_D1_DATABASE_ID`, optional `CLOUDFLARE_PAGES_PROJECT`, and optional
  `CLOUDFLARE_ALLOWED_ORIGINS`

Publish runs on pushes to `main` and on manual **Run workflow** when
`CLOUDFLARE_API_TOKEN` is set, unless `CLOUDFLARE_DEPLOY_ENABLED` is `false`.
If the token is missing, validate still runs and publish is skipped instead of
failing the workflow. Worker runtime secrets are configured with
`wrangler secret put`, not GitHub variables. The Windows workflow publishes
installers to the configured `CLOUDFLARE_R2_BUCKET` when the same token is set.

## Desktop and mobile

```bash
npm run sync                 # rebuild and sync Capacitor Android
npm run build:windows        # .NET J2534 host + Electron NSIS installer
```

The Windows J2534 native host is under `diagnostics/j2534-service/`. The optional
Python voice-intake sidecar is under `diagnostics/voice-service/`.
The packaged desktop shell remains local-first and does not bypass Cloudflare
Access. Use the hosted PWA for authenticated cloud synchronization.

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
