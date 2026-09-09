# MechPro Dispatch

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

Create the resources once, then put the returned D1 database ID in
`wrangler.jsonc`:

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

Configure a Cloudflare Access self-hosted application for
`www.yourcarguy806.com` and an identity-provider Allow policy. The committed
Worker route sends `www.yourcarguy806.com/api/*` to `mechpro-api`; Pages serves
every other path on the custom domain. This keeps browser requests same-origin
and lets Access inject `Cf-Access-Jwt-Assertion`. Change the route if the
production hostname changes, and do not expose it without the Access policy.

After the bootstrap administrator signs in, create shops in **Platform
Administration**. Account creation maps the owner's IdP email to the shop; adding
or editing an employee synchronizes that employee's email and role into D1.
Passwords, MFA, account recovery, and user lifecycle remain in the configured
IdP, not MechPro.

For local Worker API development only, set these values in an ignored
`.dev.vars`:

```dotenv
DEV_AUTH_BYPASS=1
INTEGRATION_ENCRYPTION_KEY=replace-with-a-long-random-value
DIAGNOSTICS_CAPABILITY_SECRET=replace-with-a-different-random-value
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
Configure:

- secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- variables: `CLOUDFLARE_DEPLOY_ENABLED=true`,
  `CLOUDFLARE_D1_DATABASE_ID`, optional `CLOUDFLARE_PAGES_PROJECT`, and optional
  `CLOUDFLARE_ALLOWED_ORIGINS`

The token needs Workers Scripts, D1, R2, and Pages edit permissions. Worker
runtime secrets are configured with `wrangler secret put`, not GitHub variables.
The Windows workflow publishes installers to the configured
`CLOUDFLARE_R2_BUCKET`.

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
