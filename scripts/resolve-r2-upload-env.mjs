#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function resolveR2UploadEnv(env = process.env) {
  const accessKeyId = normalizeEnvValue(env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = normalizeEnvValue(env.AWS_SECRET_ACCESS_KEY);
  const accountId = normalizeEnvValue(env.CLOUDFLARE_ACCOUNT_ID) || normalizeEnvValue(env.CF_ACCOUNT_ID);
  const bucket = normalizeEnvValue(env.CLOUDFLARE_R2_BUCKET) || normalizeEnvValue(env.R2_BUCKET);
  const missing = [];

  if (!accessKeyId) {
    missing.push('R2_ACCESS_KEY_ID');
  }
  if (!secretAccessKey) {
    missing.push('R2_SECRET_ACCESS_KEY');
  }
  if (!accountId) {
    missing.push('CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID)');
  }
  if (!bucket) {
    missing.push('CLOUDFLARE_R2_BUCKET (or R2_BUCKET)');
  }

  return { accessKeyId, secretAccessKey, accountId, bucket, missing };
}

function shellAssignment(name, value) {
  return `${name}=${JSON.stringify(value)}`;
}

function main() {
  const { accountId, bucket, missing } = resolveR2UploadEnv();

  if (missing.length) {
    console.log('SKIP_UPLOAD=1');
    console.log(
      shellAssignment(
        'SKIP_REASON',
        `Set ${missing.join(', ')} to enable this workflow.`
      )
    );
    return;
  }

  console.log('SKIP_UPLOAD=0');
  console.log(shellAssignment('ACCOUNT_ID', accountId));
  console.log(shellAssignment('BUCKET', bucket));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
