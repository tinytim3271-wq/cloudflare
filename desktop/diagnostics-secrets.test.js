'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEV_FALLBACK_SECRET, resolveDiagnosticsCapabilitySecret } = require('./diagnostics-secrets');

describe('resolveDiagnosticsCapabilitySecret', () => {
  it('prefers environment variables', () => {
    const result = resolveDiagnosticsCapabilitySecret({
      env: { MECHPRO_DIAG_CAPABILITY_SECRET: ' from-env ' },
      packaged: true,
    });
    assert.equal(result.secret, 'from-env');
    assert.equal(result.source, 'env');
  });

  it('uses the packaged secret file when present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mechpro-diag-secret-'));
    const filePath = path.join(dir, 'capability-secret.txt');
    fs.writeFileSync(filePath, 'packaged-secret\n');
    const previous = process.resourcesPath;
    process.resourcesPath = dir;
    try {
      // Place where packagedSecretCandidates looks first: resources/diagnostics-secrets/
      const nested = path.join(dir, 'diagnostics-secrets');
      fs.mkdirSync(nested);
      fs.writeFileSync(path.join(nested, 'capability-secret.txt'), 'nested-packaged-secret\n');
      const result = resolveDiagnosticsCapabilitySecret({ env: {}, packaged: true });
      assert.equal(result.secret, 'nested-packaged-secret');
      assert.match(result.source, /capability-secret\.txt$/);
    } finally {
      if (previous === undefined) delete process.resourcesPath;
      else process.resourcesPath = previous;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not throw when packaged secret is missing', () => {
    const result = resolveDiagnosticsCapabilitySecret({ env: {}, packaged: true });
    assert.equal(result.secret, '');
    assert.equal(result.source, 'missing-packaged');
  });

  it('falls back to the shared dev secret for unpackaged builds', () => {
    const result = resolveDiagnosticsCapabilitySecret({ env: {}, packaged: false });
    assert.equal(result.secret, DEV_FALLBACK_SECRET);
    assert.equal(result.source, 'dev-fallback');
  });
});
