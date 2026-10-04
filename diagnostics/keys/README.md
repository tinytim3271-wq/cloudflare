# Diagnostics capability signing keys

`/api/diagnostics/authorize` issues short-lived, single-use **capability tokens**
that gate mutating OEM procedures (currently `clear_dtcs`). Tokens are signed
with **ECDSA P-256** and verified by the J2534 host using the **public key
only** — the host never holds the private key.

- **Worker (signer):** reads the private key from the `DIAGNOSTICS_SIGNING_PRIVATE_KEY`
  secret (PKCS#8, base64-encoded DER). Without it, `/api/diagnostics/authorize`
  returns HTTP 503.
- **J2534 host (verifier):** reads the public key from
  `MECHPRO_DIAG_SIGNING_PUBLIC_KEY` (SPKI, base64-encoded DER) or
  `MECHPRO_DIAG_SIGNING_PUBLIC_KEY_PEM` (PEM). It fails closed when neither is set.

Token format: `v1.<base64url(payloadJson)>.<base64url(IEEE-P1363 signature)>`.

## Generate a keypair

```bash
# Private key (PEM, SEC1) -> keep secret
openssl ecparam -name prime256v1 -genkey -noout -out diagnostics-private.pem

# Public key (PEM, SPKI) -> ship to hosts
openssl ec -in diagnostics-private.pem -pubout -out diagnostics-public.pem

# Worker secret value (PKCS#8 base64 DER)
openssl pkcs8 -topk8 -nocrypt -in diagnostics-private.pem -outform DER | base64 -w0

# Host public key value (SPKI base64 DER)
openssl ec -in diagnostics-private.pem -pubout -outform DER | base64 -w0
```

## Provision

```bash
# Worker (production): store the PKCS#8 base64 DER private key
npx wrangler secret put DIAGNOSTICS_SIGNING_PRIVATE_KEY

# J2534 host: provide the SPKI base64 DER public key (or the PEM variant)
export MECHPRO_DIAG_SIGNING_PUBLIC_KEY="<spki-base64-der>"
```

Rotate by generating a new keypair, updating the Worker secret and every host's
public key together, then redeploying.

## Local development

`.cursor/install.sh` generates a local keypair into this directory
(`diagnostics-private.local.pem` / `diagnostics-public.local.pem`, both
gitignored) and writes the PKCS#8 base64 DER private key into `.dev.vars` as
`DIAGNOSTICS_SIGNING_PRIVATE_KEY`. The desktop bridge auto-loads
`diagnostics-public.local.pem` for the local host. These dev keys must never be
used in production.
