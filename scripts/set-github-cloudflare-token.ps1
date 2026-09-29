# Rotate GitHub Cloudflare deploy credentials after creating a token in the dashboard.
# Usage (PowerShell):
#   $env:CLOUDFLARE_API_TOKEN = '<token from https://dash.cloudflare.com/profile/api-tokens>'
#   .\scripts\set-github-cloudflare-token.ps1
#
# Create the token with Account permissions for Workers Scripts, Pages, D1, R2, and Account Settings Read.
# Account ID for this shop: 0c31efca6f8739ca301b222f3d68cff4

param(
  [string]$Repo = 'tinytim3271-wq/cloudflare'
)

$token = $env:CLOUDFLARE_API_TOKEN
if (-not $token) {
  Write-Error 'Set CLOUDFLARE_API_TOKEN in the environment to the new Cloudflare API token, then re-run this script.'
  exit 1
}

$accountId = if ($env:CLOUDFLARE_ACCOUNT_ID) { $env:CLOUDFLARE_ACCOUNT_ID } else { '0c31efca6f8739ca301b222f3d68cff4' }

$verify = curl.exe -sS -H "Authorization: Bearer $token" "https://api.cloudflare.com/client/v4/accounts/$accountId"
if ($verify -notmatch '"success"\s*:\s*true') {
  Write-Error 'Cloudflare rejected that token for this account. Create a new API token and try again.'
  exit 1
}

$token | gh secret set CLOUDFLARE_API_TOKEN -R $Repo
$accountId | gh secret set CLOUDFLARE_ACCOUNT_ID -R $Repo
Write-Host "Updated CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID on $Repo"
Write-Host 'Local Wrangler deploy remains supported with: npm run deploy:pages && npm run deploy:worker'
