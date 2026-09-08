# Web source layout

The browser PWA, Electron desktop client, and Cloudflare backend share one
program:

| Layer | Location | Responsibility |
|---|---|---|
| Browser entry | `src/main.js` | Composes modules and the legacy SPA runtime |
| Shared config | `src/shared/` | Same-origin Worker API and local storage keys |
| Platform adapters | `src/modules/platform/` | Browser, Capacitor, and Electron detection |
| Existing SPA | `src/runtime/legacy.js` | Dispatch, accounting, diagnostics, and UI |
| Backend | `worker/` | Workers, D1, R2, Workers AI, and Access identity |

Edit files under `src/`, then run:

```bash
npm run build:web
```

The generated root `app.js` remains committed so the repository can be served
directly as a static site. `npm run sync` also copies the built shell to `www/`
for Capacitor.
