'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveDiagnosticsPublicKey } = require('./diagnostics-secrets');

describe('resolveDiagnosticsPublicKey', () => {
  it('prefers environment variables', () => {
    const result = resolveDiagnosticsPublicKey({
      env: { DIAGNOSTICS_SIGNING_PUBLIC_KEY: ' public-key-from-env ' },
      packaged: true,
    });
    assert.equal(result.publicKey, 'public-key-from-env');
    assert.equal(result.source, 'env');
  });

  it('uses the packaged public key file when present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mechpro-diag-key-'));
    try {
      const nested = path.join(dir, 'diagnostics-keys');
      fs.mkdirSync(nested);
      const publicKeyPath = path.join(nested, 'capability-public-key.pem');
      fs.writeFileSync(publicKeyPath, 'packaged-public-key\n');
      const result = resolveDiagnosticsPublicKey({
        env: {},
        packaged: true,
        candidates: [publicKeyPath],
      });
      assert.equal(result.publicKey, 'packaged-public-key');
      assert.match(result.source, /capability-public-key\.pem$/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw when the packaged public key is missing', () => {
    const result = resolveDiagnosticsPublicKey({ env: {}, packaged: true, candidates: [] });
    assert.equal(result.publicKey, '');
    assert.equal(result.source, 'missing-packaged');
  });

  it('fails closed without a public key in unpackaged builds', () => {
    const result = resolveDiagnosticsPublicKey({ env: {}, packaged: false, candidates: [] });
    assert.equal(result.publicKey, '');
    assert.equal(result.source, 'missing-dev');
  });
});
