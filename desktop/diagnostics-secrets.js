'use strict';

const fs = require('node:fs');
const path = require('node:path');

function isPackagedApp() {
  try {
    return Boolean(require('electron').app?.isPackaged);
  } catch {
    return false;
  }
}

function publicKeyCandidates(options = {}) {
  if (Array.isArray(options.candidates)) return options.candidates;
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'diagnostics-keys', 'capability-public-key.pem'));
    candidates.push(path.join(process.resourcesPath, 'capability-public-key.pem'));
  }
  candidates.push(path.join(__dirname, '..', 'diagnostics', 'keys', 'local-capability-public-key.pem'));
  candidates.push(path.join(__dirname, '..', 'diagnostics', 'keys', 'capability-public-key.pem'));
  return candidates;
}

function readFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return String(fs.readFileSync(filePath, 'utf8') || '').trim();
  } catch {
    return '';
  }
}

/**
 * Resolve the ECDSA P-256 PUBLIC key used to VERIFY Worker-issued capability
 * tokens. Only the public key ships with the client — it cannot mint tokens —
 * which removes the previous risk of a shared signing secret in the installer.
 * Missing keys must not block read-only J2534 operations.
 */
function resolveDiagnosticsPublicKey(options = {}) {
  const env = options.env || process.env;
  const fromEnv = String(env.DIAGNOSTICS_SIGNING_PUBLIC_KEY || '').trim();
  if (fromEnv) return { publicKey: fromEnv, source: 'env' };

  const fromEnvFilePath = String(env.DIAGNOSTICS_SIGNING_PUBLIC_KEY_FILE || '').trim();
  if (fromEnvFilePath) {
    const fromEnvFile = readFile(fromEnvFilePath);
    if (fromEnvFile) return { publicKey: fromEnvFile, source: fromEnvFilePath };
  }

  // `options.candidates` allows tests to control the file lookup hermetically
  // (e.g. assert the "missing" path without the repo's committed public key).
  const candidates = options.candidates || publicKeyCandidates();
  for (const candidate of candidates) {
    const fromFile = readFile(candidate);
    if (fromFile) return { publicKey: fromFile, source: candidate };
  }

  return { publicKey: '', source: (options.packaged ?? isPackagedApp()) ? 'missing-packaged' : 'missing-dev' };
}

module.exports = { resolveDiagnosticsPublicKey };
