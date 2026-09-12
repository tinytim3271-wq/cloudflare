'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEV_FALLBACK_SECRET = 'mechpro-dev-diagnostics-capability-v1';

function isPackagedApp() {
  try {
    return Boolean(require('electron').app?.isPackaged);
  } catch {
    return false;
  }
}

function packagedSecretCandidates() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'diagnostics-secrets', 'capability-secret.txt'));
    candidates.push(path.join(process.resourcesPath, 'capability-secret.txt'));
  }
  candidates.push(path.join(__dirname, 'packaged-secrets', 'capability-secret.txt'));
  return candidates;
}

function readSecretFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return String(fs.readFileSync(filePath, 'utf8') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Resolve the HMAC secret used to verify Worker-issued clear-DTC capability tokens.
 * Packaged builds should receive the production secret via CI as
 * resources/diagnostics-secrets/capability-secret.txt (must match Worker
 * DIAGNOSTICS_CAPABILITY_SECRET). Missing secrets must not block read-only
 * J2534 operations (list/connect/identify/read DTCs).
 */
function resolveDiagnosticsCapabilitySecret(options = {}) {
  const env = options.env || process.env;
  const fromEnv = String(
    env.MECHPRO_DIAG_CAPABILITY_SECRET
    || env.DIAGNOSTICS_CAPABILITY_SECRET
    || '',
  ).trim();
  if (fromEnv) return { secret: fromEnv, source: 'env' };

  for (const candidate of packagedSecretCandidates()) {
    const fromFile = readSecretFile(candidate);
    if (fromFile) return { secret: fromFile, source: candidate };
  }

  if (options.packaged ?? isPackagedApp()) {
    return { secret: '', source: 'missing-packaged' };
  }
  return { secret: DEV_FALLBACK_SECRET, source: 'dev-fallback' };
}

module.exports = {
  DEV_FALLBACK_SECRET,
  resolveDiagnosticsCapabilitySecret,
};
