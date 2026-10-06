#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveR2UploadEnv(env = process.env) {
  const apiToken = normalizeEnvValue(env.CLOUDFLARE_API_TOKEN);
  const accountId = normalizeEnvValue(env.CLOUDFLARE_ACCOUNT_ID) || normalizeEnvValue(env.CF_ACCOUNT_ID);
  const bucket = normalizeEnvValue(env.CLOUDFLARE_R2_BUCKET) || normalizeEnvValue(env.R2_BUCKET);
  const missing = [];

  if (!apiToken) {
    missing.push('CLOUDFLARE_API_TOKEN');
  }
  if (!accountId) {
    missing.push('CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID)');
  }
  if (!bucket) {
    missing.push('CLOUDFLARE_R2_BUCKET (or R2_BUCKET)');
  }

  return { apiToken, accountId, bucket, missing };
}

function shellAssignment(name, value) {
  return `${name}='${String(value).replaceAll("'", "'\"'\"'")}'`;
}

export function formatResolvedR2UploadEnv({ apiToken, accountId, bucket, missing }) {
  if (missing.length) {
    return [
      'SKIP_UPLOAD=1',
      shellAssignment('SKIP_REASON', `Set ${missing.join(', ')} to enable this workflow.`),
    ].join('\n');
  }

  return [
    'SKIP_UPLOAD=0',
    shellAssignment('CLOUDFLARE_API_TOKEN', apiToken),
    shellAssignment('CLOUDFLARE_ACCOUNT_ID', accountId),
    shellAssignment('BUCKET', bucket),
  ].join('\n');
}

function main() {
  const outputPath = process.argv[2];
  if (!outputPath) {
    console.error('Usage: resolve-r2-upload-env.mjs <output-path>');
    process.exit(1);
  }
  writeFileSync(outputPath, `${formatResolvedR2UploadEnv(resolveR2UploadEnv())}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
