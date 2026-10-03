# Merging Windows MechPro folders into this repo

This guide consolidates local MechPro copies on a Windows PC into this Cloudflare repository.

## Layout (source of truth)

| Surface | Path | Notes |
| --- | --- | --- |
| Frontend PWA | `src/` → bundled `app.js` | Modular entry at `src/main.js` |
| Windows desktop | `desktop/`, root `package.json` | Electron; `npm run desktop`, `npm run build:windows` |
| Cloudflare backend | `worker/`, `wrangler.jsonc` | D1, R2, Workers AI |
| Historical zips | `zip/` | Old static PWA bundles only |

Only copy Cloudflare app surfaces (`src/`, `desktop/`, `worker/`, `public/`). Skip obsolete backend stacks from older folders.

## One-command merge (Windows)

```powershell
cd <path-to-this-repo>
npm ci

# Preview what would be copied (no changes):
.\scripts\merge-windows.ps1 -DryRun

# Run full merge + validate:
.\scripts\merge-windows.ps1

# Merge, validate, and commit:
.\scripts\merge-windows.ps1 -Commit
```

The script inventories known Windows paths, runs `compare-folders.mjs --deep`, copies files that exist **only** in external folders into `src/`, `desktop/`, `worker/`, etc., and runs `npm run validate`.

## Manual compare

```powershell
node scripts/compare-folders.mjs C:\MechPro-work
node scripts/compare-folders.mjs C:\MechPro-work --deep
```
