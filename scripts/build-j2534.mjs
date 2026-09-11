#!/usr/bin/env node
/**
 * Cross-platform J2534 host publish.
 * Uses PowerShell on Windows and the bash script elsewhere.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const script = win
  ? join(root, 'diagnostics/j2534-service/scripts/publish-win-x64.ps1')
  : join(root, 'diagnostics/j2534-service/scripts/publish-win-x64.sh');
const command = win ? 'powershell.exe' : 'bash';
const args = win ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script] : [script];

const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
