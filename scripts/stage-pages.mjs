#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const destination = '.pages-dist';
rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
for (const file of [
  'index.html',
  'app.js',
  'styles.css',
  'theme.css',
  'service-worker.js',
  'diagnostics-ui.js',
  'manifest.webmanifest',
  'mechpro-icon.svg',
]) cpSync(file, `${destination}/${file}`);
cpSync('assets', `${destination}/assets`, { recursive: true });
cpSync('public', destination, { recursive: true });
try {
  cpSync('downloads', `${destination}/downloads`, { recursive: true });
} catch {
  mkdirSync(`${destination}/downloads`, { recursive: true });
}
console.log(`Staged Cloudflare Pages assets in ${destination}`);
