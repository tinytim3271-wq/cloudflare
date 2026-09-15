# Architecture Overview

## High-level system and module map
- **Frontend PWA shell**: `index.html`, `styles.css`, `service-worker.js`, static assets.
- **Web source entry**: `src/main.js` builds to root `app.js` via `npm run build:web`.
- **Runtime modules**: `src/runtime/*`, `src/modules/*`, and shared helpers under `src/shared/*`.
- **Cloudflare Worker API**: `worker/src/index.js` with route handlers under `worker/src/routes/*`.
- **Persistence/services**: Cloudflare D1 (data), R2 (files/downloads), Workers AI (assistant endpoints).
- **Packaging targets**: Android wrapper in `android/`, desktop wrapper in `desktop/`.

## Current monolith note
The committed root `app.js` is a generated bundle and remains large because it still packages legacy runtime behavior. This PR keeps behavior unchanged while adding a clear bootstrap seam in `src/main.js` for future extraction work.

## Incremental modularization path (non-breaking)
1. Keep `src/main.js` as the stable bootstrap boundary and module registration seam.
2. Move isolated legacy concerns from `src/runtime/legacy.js` into focused modules (state, views, actions) one domain at a time.
3. Add targeted tests per extracted module before each move to preserve behavior.
4. Keep root `app.js` generated only from `src/` and avoid direct edits.
5. Retire legacy entry logic only after equivalent module coverage and smoke validation.
