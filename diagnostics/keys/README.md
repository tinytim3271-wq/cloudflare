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

### Recommended: provision via GitHub secret (hands-off)

The `Cloudflare deploy` workflow auto-provisions the Worker secret from a GitHub
Actions repo secret on every deploy, so you never touch the Worker directly:

1. Generate a key pair and get the base64 private key + the public key:
   ```bash
   bash scripts/setup-diagnostics-signing-key.sh --print-secret
   ```
   (`--print-secret` prints the base64 DER private key instead of calling
   `wrangler`, and still writes `diagnostics/keys/capability-public-key.pem`.)
2. Add the printed value as the GitHub repo secret **`DIAGNOSTICS_SIGNING_PRIVATE_KEY`**
   (Settings → Secrets and variables → Actions → New repository secret).
3. Commit `diagnostics/keys/capability-public-key.pem` (public key — safe to commit).
4. Re-run the deploy. The workflow's **Provision diagnostics signing key secret**
   step pushes the key to the Worker (`wrangler secret put`) before Pages deploy,
   and the post-deploy **Verify diagnostics signing key secret** step confirms it.

Rotating: generate a new pair (`--rotate --print-secret`), update the GitHub
secret, commit the new public key. Rotation invalidates tokens signed by the old
key.

### Alternative: set it directly with wrangler

On a machine where `wrangler` is authenticated to Cloudflare:

```bash
bash scripts/setup-diagnostics-signing-key.sh   # generates keys, sets the Worker secret, writes the public key
```

Or manually:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out ec.pem
openssl pkcs8 -topk8 -nocrypt -in ec.pem -out capability-private-key.pkcs8.pem
openssl ec -in ec.pem -pubout -out capability-public-key.pem
grep -v -- '-----' capability-private-key.pkcs8.pem | tr -d '\n' | wrangler secret put DIAGNOSTICS_SIGNING_PRIVATE_KEY
```

Never commit a private key. Public keys are safe to commit.
