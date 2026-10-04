import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { base64UrlEncode, signDiagnosticsToken } from '../src/security.mjs';

const require = createRequire(import.meta.url);

function toBase64(arrayBuffer) {
  return Buffer.from(new Uint8Array(arrayBuffer)).toString('base64');
}

test('worker-signed ECDSA capability token verifies on the J2534 host', async () => {
  // Generate an ECDSA P-256 keypair the way provisioning would.
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateKeyB64 = toBase64(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const publicKeyB64 = toBase64(await crypto.subtle.exportKey('spki', pair.publicKey));

  // Sign a payload exactly like worker/src/index.js does.
  const payload = {
    v: 1,
    procedure: 'clear_dtcs',
    vin: '1C6SRFHT0LN123456',
    shopId: 'cross-test-shop',
    exp: Date.now() + 5 * 60 * 1000,
    jti: crypto.randomUUID().replaceAll('-', ''),
  };
  const payloadJson = JSON.stringify(payload);
  const signature = await signDiagnosticsToken(privateKeyB64, payloadJson);
  const token = `v1.${base64UrlEncode(new TextEncoder().encode(payloadJson))}.${signature}`;

  // The host verifies with the public key only.
  process.env.MECHPRO_DIAG_SIGNING_PUBLIC_KEY = publicKeyB64;
  const { verifyClearDtcsToken } = require('../../diagnostics/j2534-host-node/capability-token.js');

  const verified = verifyClearDtcsToken(token, { vin: payload.vin, consume: false });
  assert.equal(verified.procedure, 'clear_dtcs');
  assert.equal(verified.vin, payload.vin);
  assert.equal(verified.shopId, 'cross-test-shop');

  // A tampered payload must fail verification.
  const tampered = `v1.${base64UrlEncode(new TextEncoder().encode(payloadJson.replace('cross-test-shop', 'evil-shop')))}.${signature}`;
  assert.throws(() => verifyClearDtcsToken(tampered, { consume: false }), /signature/i);
});
