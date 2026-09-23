#!/usr/bin/env bash
# DEPRECATED: Windows installers are published to Cloudflare R2 by
# .github/workflows/windows-desktop.yml (publish-download job).
# Do not use this AWS CloudFormation/S3 path for new releases.
set -euo pipefail

cat >&2 <<'EOF'
publish-windows-download.sh is retired.

Publish MechPro Windows installers with the GitHub Actions workflow
`.github/workflows/windows-desktop.yml`, which uploads to Cloudflare R2:

  downloads/MechPro-Setup-<version>.exe
  downloads/MechPro-Setup-<version>.zip

For a local upload after `npm run build:windows`, use:

  npx wrangler r2 object put "$R2_BUCKET/downloads/MechPro-Setup-$VERSION.exe" --remote --file "dist/windows/MechPro-Setup-$VERSION.exe"
  npx wrangler r2 object put "$R2_BUCKET/downloads/MechPro-Setup-$VERSION.zip" --remote --file "dist/windows/MechPro-Setup-$VERSION.zip"

AWS CloudFormation / S3 / CloudFront publishing is no longer supported.
EOF
exit 1
