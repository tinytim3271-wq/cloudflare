/**
 * ECDSA P-256 diagnostics capability tokens (clear_dtcs).
 *
 * The Cloudflare Worker (`worker/src/index.js`) signs tokens with the private
 * key `DIAGNOSTICS_SIGNING_PRIVATE_KEY`. This host verifies them with the
 * matching PUBLIC key only — it never needs the private key in production.
 *
 * Token format: `v1.<base64url(payloadJson)>.<base64url(IEEE-P1363 signature)>`
 */
const {
  createPublicKey,
  createPrivateKey,
  randomBytes,
  sign,
  verify,
} = require('node:crypto');

const consumedJti = new Set();

function publicKey() {
  const pem = process.env.MECHPRO_DIAG_SIGNING_PUBLIC_KEY_PEM;
  if (pem && pem.includes('BEGIN')) {
    return createPublicKey({ key: pem, format: 'pem' });
  }
  const der = process.env.MECHPRO_DIAG_SIGNING_PUBLIC_KEY;
  if (der) {
    return createPublicKey({ key: Buffer.from(der.trim(), 'base64'), format: 'der', type: 'spki' });
  }
  throw new Error('Diagnostics signing public key is not configured (set MECHPRO_DIAG_SIGNING_PUBLIC_KEY)');
}

function privateKey() {
  const pem = process.env.MECHPRO_DIAG_SIGNING_PRIVATE_KEY_PEM;
  if (pem && pem.includes('BEGIN')) {
    return createPrivateKey({ key: pem, format: 'pem' });
  }
  const der = process.env.MECHPRO_DIAG_SIGNING_PRIVATE_KEY;
  if (der) {
    return createPrivateKey({ key: Buffer.from(der.trim(), 'base64'), format: 'der', type: 'pkcs8' });
  }
  throw new Error('Diagnostics signing private key is not configured (set MECHPRO_DIAG_SIGNING_PRIVATE_KEY)');
}

function verifySignature(payloadJson, signatureB64Url) {
  let valid = false;
  try {
    valid = verify(
      'sha256',
      Buffer.from(payloadJson, 'utf8'),
      { key: publicKey(), dsaEncoding: 'ieee-p1363' },
      Buffer.from(signatureB64Url, 'base64url'),
    );
  } catch {
    valid = false;
  }
  if (!valid) {
    throw new Error('Invalid diagnostics capability token signature');
  }
}

function verifyClearDtcsToken(token, expected = {}) {
  const raw = String(token || '').trim();
  const parts = raw.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') {
    throw new Error('Invalid diagnostics capability token');
  }
  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
  verifySignature(payloadJson, parts[2]);
  const payload = JSON.parse(payloadJson);
  if (payload.v !== 1 || payload.procedure !== 'clear_dtcs') {
    throw new Error('Capability token is not valid for clearDtcs');
  }
  if (!payload.vin || !payload.shopId || !payload.jti || !payload.exp) {
    throw new Error('Capability token payload is incomplete');
  }
  if (Date.now() > Number(payload.exp)) {
    throw new Error('Capability token expired');
  }
  if (expected.vin && payload.vin !== String(expected.vin).trim().toUpperCase()) {
    throw new Error('Capability token VIN mismatch');
  }
  if (expected.consume !== false) {
    if (consumedJti.has(payload.jti)) {
      throw new Error('Capability token already used');
    }
    consumedJti.add(payload.jti);
    if (consumedJti.size > 500) {
      const first = consumedJti.values().next().value;
      consumedJti.delete(first);
    }
  }
  return payload;
}

/**
 * Dev/test helper that mints a signed token the way the Worker does.
 * Requires a private key (MECHPRO_DIAG_SIGNING_PRIVATE_KEY); never used in
 * production hosts, which only ever verify.
 */
function mintClearDtcsToken(input, ttlMs = 5 * 60 * 1000) {
  const payload = {
    v: 1,
    procedure: 'clear_dtcs',
    vin: String(input.vin || '').trim().toUpperCase(),
    shopId: String(input.shopId || 'local').trim(),
    exp: Date.now() + ttlMs,
    jti: randomBytes(12).toString('hex'),
  };
  const payloadJson = JSON.stringify(payload);
  const signature = sign(
    'sha256',
    Buffer.from(payloadJson, 'utf8'),
    { key: privateKey(), dsaEncoding: 'ieee-p1363' },
  ).toString('base64url');
  const token = `v1.${Buffer.from(payloadJson).toString('base64url')}.${signature}`;
  return { token, expiresAt: new Date(payload.exp).toISOString(), payload };
}

module.exports = { verifyClearDtcsToken, mintClearDtcsToken };
