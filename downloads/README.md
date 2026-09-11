# MechPro app downloads

## Public install page

- https://www.yourcarguy806.com/downloads/
- https://mechpro-dispatch.pages.dev/downloads/

## Binaries

| File | Source |
| --- | --- |
| `MechPro.apk` | Committed under `downloads/` and also mirrored to R2 `downloads/MechPro.apk` |
| `MechPro-Setup-*.exe` / `.zip` | **Not** in git (too large). Published by `windows-desktop.yml` to R2 and GitHub Releases |

On `www.yourcarguy806.com`, the Worker serves `/downloads/*.{exe,zip,apk}` from R2 (`mechpro-files`) before proxying other paths to Pages. The install page HTML still comes from Pages.

GitHub Release:

- https://github.com/tinytim3271-wq/cloudflare/releases/tag/desktop-v1.0.0

Manual R2 upload:

```bash
npx wrangler r2 object put "mechpro-files/downloads/MechPro-Setup-1.0.0.exe" --remote --file path/to/exe --content-type application/octet-stream
npx wrangler r2 object put "mechpro-files/downloads/MechPro-Setup-1.0.0.zip" --remote --file path/to/zip --content-type application/zip
npx wrangler r2 object put "mechpro-files/downloads/MechPro.apk" --remote --file downloads/MechPro.apk --content-type application/vnd.android.package-archive
```
