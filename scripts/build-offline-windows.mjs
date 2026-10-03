import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const editionPath = new URL('../desktop/edition.json', import.meta.url);
const onlineEdition = `${JSON.stringify({ offline: false }, null, 2)}\n`;

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status || 1);
}

writeFileSync(editionPath, `${JSON.stringify({ offline: true }, null, 2)}\n`);
try {
  run('npm', ['run', 'build:web']);
  run('npm', ['run', 'build:j2534']);
  run('node', ['scripts/bake-diagnostics-secret.mjs']);
  run('npx', ['electron-builder', '--win', 'nsis', '--publish', 'never', '--config', 'desktop/builder-offline.json']);
} finally {
  writeFileSync(editionPath, onlineEdition);
}
