#!/usr/bin/env node
import assert from 'node:assert/strict';

import { formatResolvedR2UploadEnv, resolveR2UploadEnv } from './resolve-r2-upload-env.mjs';

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_API_TOKEN: ' token-value ',
    CLOUDFLARE_ACCOUNT_ID: '\n account-id \r\n',
    CLOUDFLARE_R2_BUCKET: ' bucket-name ',
  });

  assert.equal(resolved.apiToken, 'token-value');
  assert.equal(resolved.accountId, 'account-id');
  assert.equal(resolved.bucket, 'bucket-name');
  assert.deepEqual(resolved.missing, []);
}

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_API_TOKEN: ' token-value ',
    CLOUDFLARE_ACCOUNT_ID: ' \n ',
    CF_ACCOUNT_ID: ' legacy-account ',
    CLOUDFLARE_R2_BUCKET: '\t',
    R2_BUCKET: ' legacy-bucket ',
  });

  assert.equal(resolved.accountId, 'legacy-account');
  assert.equal(resolved.bucket, 'legacy-bucket');
  assert.deepEqual(resolved.missing, []);
}

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_R2_BUCKET: 'bucket-name',
  });

  assert.deepEqual(resolved.missing, ['CLOUDFLARE_API_TOKEN']);

  assert.equal(
    formatResolvedR2UploadEnv(resolved),
    "SKIP_UPLOAD=1\nSKIP_REASON='Set CLOUDFLARE_API_TOKEN to enable this workflow.'",
  );
}

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_API_TOKEN: 'token',
    CLOUDFLARE_ACCOUNT_ID: '\n',
    CLOUDFLARE_R2_BUCKET: ' ',
  });

  assert.equal(resolved.accountId, '');
  assert.equal(resolved.bucket, '');
  assert.deepEqual(resolved.missing, [
    'CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID)',
    'CLOUDFLARE_R2_BUCKET (or R2_BUCKET)',
  ]);

  assert.equal(
    formatResolvedR2UploadEnv(resolved),
    'SKIP_UPLOAD=1\n'
      + "SKIP_REASON='Set CLOUDFLARE_ACCOUNT_ID (or CF_ACCOUNT_ID), CLOUDFLARE_R2_BUCKET (or R2_BUCKET) to enable this workflow.'",
  );
}

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_API_TOKEN: " token$(printf hacked) ",
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_R2_BUCKET: 'bucket-name',
  });

  assert.equal(resolved.apiToken, 'token$(printf hacked)');

  assert.equal(
    formatResolvedR2UploadEnv(resolved),
    "SKIP_UPLOAD=0\n"
      + "CLOUDFLARE_API_TOKEN='token$(printf hacked)'\n"
      + "CLOUDFLARE_ACCOUNT_ID='account-id'\n"
      + "BUCKET='bucket-name'",
  );
}

{
  assert.equal(
    formatResolvedR2UploadEnv({
      apiToken: "tech's-token",
      accountId: "shop's-account",
      bucket: "tech's-bucket",
      missing: [],
    }),
    "SKIP_UPLOAD=0\nCLOUDFLARE_API_TOKEN='tech'\"'\"'s-token'\nCLOUDFLARE_ACCOUNT_ID='shop'\"'\"'s-account'\nBUCKET='tech'\"'\"'s-bucket'",
  );
}

console.log('resolve-r2-upload-env tests passed');
