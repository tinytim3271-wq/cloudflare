# MechPro program — audit note

**Status:** MechPro runs entirely on Cloudflare.

| Surface | Location | Notes |
| --- | --- | --- |
| Frontend PWA | `src/` → `app.js` | `npm run build:web` |
| Windows desktop | `desktop/` | Electron; Google / magic-link via Worker |
| Backend | `worker/` + `wrangler.jsonc` | D1, R2, Workers AI |
| Pages | Cloudflare Pages `mechpro-dispatch` | Production shell |
| Auth | Worker session / Google / magic-link | Cookie `mechpro_session` |

Use `docs/cloudflare-saas-architecture.md` and `docs/OPERATIONS.md` for operations.
