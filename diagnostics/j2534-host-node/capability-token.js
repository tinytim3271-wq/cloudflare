/**
 * ECDSA P-256 (ES256) diagnostics capability tokens (format `v2.<payload>.<sig>`).
 *
 * The Cloudflare Worker signs tokens with a private key that never leaves the
 * server. Hosts hold only the PUBLIC key, so a compromised or reverse-engineered
 * client cannot mint tokens (fixes the previous shared-HMAC-secret weakness).
 *
 * Fail-closed: verification requires a configured public key. There is no
 * built-in key that could validate real tokens.
 * Compatible with diagnostics/j2534-service/src/J2534.Host/CapabilityToken.cs.
 */
const { createPublicKey, createPrivateKey, sign, verify, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/** jti -> expiry (ms). Single-use enforcement with expiry-aware pruning. */
const consumed = new Map();

function pemFromSpkiBase64(base64) {
  const body = base64.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----\n`;
}

function defaultPublicKeyPaths() {
  return [
    // Ephemeral dev key written by .cursor/install.sh (gitignored).
    path.join(__dirname, '..', 'keys', 'local-capability-public-key.pem'),
    // Production key provisioned by CI alongside the packaged build.
    path.join(__dirname, '..', 'keys', 'capability-public-key.pem'),
  ];
}

function loadPublicKey() {
  const inline = String(process.env.DIAGNOSTICS_SIGNING_PUBLIC_KEY || '').trim();
  if (inline) {
    return createPublicKey(inline.includes('BEGIN') ? inline : pemFromSpkiBase64(inline));
  }
  const explicitFile = String(process.env.DIAGNOSTICS_SIGNING_PUBLIC_KEY_FILE || '').trim();
  const candidates = explicitFile ? [explicitFile, ...defaultPublicKeyPaths()] : defaultPublicKeyPaths();
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate)) return createPublicKey(fs.readFileSync(candidate, 'utf8'));
    } catch { /* try next candidate */ }
  }
  return null;
}

function pruneConsumed() {
  const now = Date.now();
  for (const [jti, exp] of consumed) {
    if (exp <= now) consumed.delete(jti);
  }
}

/**
 * Verify a capability token. `expected` may constrain procedure, vin, and mode.
 * Pass `consume: false` for a pre-flight signature/expiry check that does not
 * burn the single-use nonce (the executing host performs the consuming check).
 */
function verifyCapabilityToken(token, expected = {}) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'v2') {
    throw new Error('Invalid diagnostics capability token');
  }
  const publicKey = loadPublicKey();
  if (!publicKey) {
    throw new Error('Diagnostics capability public key is not configured; refusing to authorize.');
  }
  const signingInput = `${parts[0]}.${parts[1]}`;
  const signature = Buffer.from(parts[2], 'base64url');
  const valid = verify('sha256', Buffer.from(signingInput), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
  if (!valid) {
    throw new Error('Invalid diagnostics capability token signature');
  }
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (payload.v !== 2 || !payload.procedure || !payload.vin || !payload.shopId || !payload.jti || !payload.exp || !payload.mode) {
    throw new Error('Capability token payload is incomplete');
  }
  if (Date.now() > Number(payload.exp)) {
    throw new Error('Capability token expired');
  }
  if (expected.procedure && payload.procedure !== expected.procedure) {
    throw new Error(`Capability token is not valid for ${expected.procedure}`);
  }
  if (expected.vin && payload.vin !== String(expected.vin).trim().toUpperCase()) {
    throw new Error('Capability token VIN mismatch');
  }
  if (expected.mode && payload.mode !== expected.mode) {
    throw new Error('Capability token mode mismatch');
  }
  if (expected.consume !== false) {
    pruneConsumed();
    if (consumed.has(payload.jti)) {
      throw new Error('Capability token already used');
    }
    consumed.set(payload.jti, Number(payload.exp));
  }
  return payload;
}

/**
 * Sign a capability token with an ECDSA P-256 private key (PEM/DER). Intended
 * for development seeding and tests only — production tokens are minted by the
 * Worker, which holds the private key.
 */
function mintCapabilityToken(privateKey, input) {
  const key = typeof privateKey === 'string' && !privateKey.includes('BEGIN')
    ? createPrivateKey({ key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8' })
    : createPrivateKey(privateKey);
  const now = Date.now();
  const payload = {
    v: 2,
    procedure: input.procedure,
    scope: input.scope || '',
    vin: String(input.vin || '').trim().toUpperCase(),
    shopId: input.shopId || 'local',
    mode: input.mode || 'simulate',
    actor: input.actor || null,
    iat: now,
    exp: now + (input.ttlMs || 5 * 60 * 1000),
    jti: randomBytes(12).toString('hex'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `v2.${payloadB64}`;
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { token: `${signingInput}.${signature}`, payload };
}

module.exports = { verifyCapabilityToken, mintCapabilityToken, loadPublicKey };
