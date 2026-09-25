# Diagnostics capability signing keys

Diagnostic capability tokens (clear DTC, key programming, module flashing) are
signed with an **ECDSA P-256** key pair.

- The **private key** lives only in the Cloudflare Worker as the
  `DIAGNOSTICS_SIGNING_PRIVATE_KEY` secret (PKCS#8, base64 DER). It signs tokens
  in `POST /api/diagnostics/authorize`. It is never shipped to clients.
- The **public key** is distributed to diagnostic hosts so they can *verify*
  tokens but cannot *mint* them. Hosts load it from, in order:
  1. `DIAGNOSTICS_SIGNING_PUBLIC_KEY` (inline PEM or base64 SPKI) env var,
  2. `DIAGNOSTICS_SIGNING_PUBLIC_KEY_FILE` env var (path),
  3. `diagnostics/keys/local-capability-public-key.pem` (dev, gitignored),
  4. `diagnostics/keys/capability-public-key.pem` (production, provisioned by CI).

If no public key is configured, hosts **fail closed** and refuse every
authorized (mutating) procedure.

## Local development

`.cursor/install.sh` generates an ephemeral dev key pair on first setup:
`local-capability-private-key.pem` / `local-capability-public-key.pem` (both
gitignored) and writes the matching `DIAGNOSTICS_SIGNING_PRIVATE_KEY` into
`.dev.vars`.

## Production

**Quickest path:** on a machine where `wrangler` is authenticated to Cloudflare
(`npx wrangler login`, or `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` set):

```bash
bash scripts/setup-diagnostics-signing-key.sh   # add --rotate to replace an existing key
```

This generates the key pair, sets the `DIAGNOSTICS_SIGNING_PRIVATE_KEY` Worker
secret (piped, never printed), and writes the public key to
`diagnostics/keys/capability-public-key.pem` (commit it). Then run
`npm run deploy:worker`.

Or provision manually:
- set the Worker secret: `wrangler secret put DIAGNOSTICS_SIGNING_PRIVATE_KEY`
- place the SPKI public key at `diagnostics/keys/capability-public-key.pem`
  (or ship it in the packaged desktop resources) so hosts can verify.

Generate a pair:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out ec.pem
openssl pkcs8 -topk8 -nocrypt -in ec.pem -out capability-private-key.pkcs8.pem
openssl ec -in ec.pem -pubout -out capability-public-key.pem
# Worker secret value (single-line base64 DER):
grep -v -- '-----' capability-private-key.pkcs8.pem | tr -d '\n'
```

Never commit a private key. Public keys are safe to commit.
