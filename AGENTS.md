# AGENTS.md

## Cursor Cloud specific instructions

This repository has three independent parts:

- **Frontend PWA** (repo root: `index.html`, `app.js`, `styles.css`, `service-worker.js`, `assets/`) — a vanilla-JS, local-first Progressive Web App for shop dispatch and work orders. Cloudflare Pages serves it; seed data persists in `localStorage` (`mechpro-dispatch-v1`) and cloud synchronization fails gracefully offline.
- **Web/packaging source** (`src/`, root `package.json`, `scripts/`) — edit source under `src/`, then run `npm run build:web` to refresh the committed root `app.js`. `npm run sync` also copies the offline shell into `www/` for the Capacitor Android wrapper in `android/`.
- **Cloudflare backend** (`worker/`, `wrangler.jsonc`) — a Worker API using D1, R2, Workers AI, and Cloudflare Access identity. Run `npm run test:worker`, `npm run db:migrate:local`, and `npm run dev:worker` for local work. Remote deploys require Cloudflare credentials.

### Toolchain / non-obvious gotchas

- Use Node 24, matching `.github/workflows/cloudflare-pages.yml`.
- Replace the placeholder D1 ID in `wrangler.jsonc` before remote migration or deployment.

### Running the frontend (browser)

Serve the repo root over HTTP (service worker registration is gated on a secure context, and `localhost`/`127.0.0.1` counts as secure), e.g.:

```
python3 -m http.server 3000 --bind 127.0.0.1   # then open http://127.0.0.1:3000/
```

Serving the root still only requires a browser refresh. When editing source under `src/`, run `npm run build:web` first. The service worker caches aggressively; hard-reload or clear the `mechpro-dispatch-v1` service-worker cache if edits don't appear.

### OEM Diagnostics (J2534 / Windows)

- **J2534 native host** lives in `diagnostics/j2534-service/`. Build with .NET 8: `./diagnostics/j2534-service/scripts/publish-win-x64.sh` (or `publish-win-x64.ps1` on Windows). Output: `diagnostics/j2534-service/publish/win-x64/J2534.Host.exe`.
- **Windows installer** bundles that exe via `npm run build:windows` (runs J2534 publish then `electron-builder`). Requires Windows for the final NSIS installer; CI workflow `.github/workflows/windows-desktop.yml` builds on `windows-latest`.
- On Windows with a registered J2534 adapter, Electron prefers `J2534.Host.exe` over the Node simulator (`desktop/diagnostics-bridge.js`).
- **Cloudflare diagnostics API** (`/api/diagnostics/coverage`, `/api/diagnostics/audit`, `/api/diagnostics/authorize`) deploys with the Worker.
