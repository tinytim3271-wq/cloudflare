# MechPro unified program — audit note

**Status (2026-09-29):** MechPro runs entirely on Cloudflare. The former AWS CDK/Lambda/`infra/` tree and Cognito auth path have been removed from this repository.

| Surface | Location | Notes |
| --- | --- | --- |
| Frontend PWA | `src/` → `app.js` | `npm run build:web` |
| Windows desktop | `desktop/` | Electron; Google / magic-link via Worker |
| Backend | `worker/` + `wrangler.jsonc` | D1, R2, Workers AI |
| Pages | Cloudflare Pages `mechpro-dispatch` | Production shell |
| Auth | Worker session / Google / magic-link | No Cognito |

Use `docs/cloudflare-saas-architecture.md` and `docs/OPERATIONS.md` for current operations. Historical AWS merge notes are obsolete.
