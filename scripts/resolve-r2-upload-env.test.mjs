#!/usr/bin/env node
import assert from 'node:assert/strict';

import { formatResolvedR2UploadEnv, resolveR2UploadEnv } from './resolve-r2-upload-env.mjs';

{
  const resolved = resolveR2UploadEnv({
    AWS_ACCESS_KEY_ID: ' access-key ',
    AWS_SECRET_ACCESS_KEY: '\nsecret-key\t',
    CLOUDFLARE_ACCOUNT_ID: '\n account-id \r\n',
    CLOUDFLARE_R2_BUCKET: ' bucket-name ',
  });

  assert.equal(resolved.accessKeyId, 'access-key');
  assert.equal(resolved.secretAccessKey, 'secret-key');
  assert.equal(resolved.accountId, 'account-id');
  assert.equal(resolved.bucket, 'bucket-name');
  assert.deepEqual(resolved.missing, []);
}

{
  const resolved = resolveR2UploadEnv({
    R2_ACCESS_KEY_ID: ' legacy-key ',
    R2_SECRET_ACCESS_KEY: '\tlegacy-secret\n',
    CLOUDFLARE_ACCOUNT_ID: ' \n ',
    CF_ACCOUNT_ID: ' legacy-account ',
    CLOUDFLARE_R2_BUCKET: '\t',
    R2_BUCKET: ' legacy-bucket ',
  });

  assert.equal(resolved.accessKeyId, 'legacy-key');
  assert.equal(resolved.secretAccessKey, 'legacy-secret');
  assert.equal(resolved.accountId, 'legacy-account');
  assert.equal(resolved.bucket, 'legacy-bucket');
  assert.deepEqual(resolved.missing, []);
}

{
  const resolved = resolveR2UploadEnv({
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_R2_BUCKET: 'bucket-name',
  });

  assert.deepEqual(resolved.missing, [
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
  ]);

  assert.equal(
    formatResolvedR2UploadEnv(resolved),
    "SKIP_UPLOAD=1\nSKIP_REASON='Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to enable this workflow.'",
  );
}

{
  const resolved = resolveR2UploadEnv({
    AWS_ACCESS_KEY_ID: 'key',
    AWS_SECRET_ACCESS_KEY: 'secret',
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
    AWS_ACCESS_KEY_ID: 'key',
    AWS_SECRET_ACCESS_KEY: 'secret',
    CLOUDFLARE_ACCOUNT_ID: 'account-id',
    CLOUDFLARE_R2_BUCKET: 'bucket-name',
  });

  assert.equal(
    formatResolvedR2UploadEnv(resolved),
    "SKIP_UPLOAD=0\nAWS_ACCESS_KEY_ID='key'\nAWS_SECRET_ACCESS_KEY='secret'\nACCOUNT_ID='account-id'\nBUCKET='bucket-name'",
  );
}

{
  assert.equal(
    formatResolvedR2UploadEnv({
      accessKeyId: "tech's-key",
      secretAccessKey: "super'secret",
      accountId: "shop's-account",
      bucket: "tech's-bucket",
      missing: [],
    }),
    "SKIP_UPLOAD=0\nAWS_ACCESS_KEY_ID='tech'\"'\"'s-key'\nAWS_SECRET_ACCESS_KEY='super'\"'\"'secret'\nACCOUNT_ID='shop'\"'\"'s-account'\nBUCKET='tech'\"'\"'s-bucket'",
  );
}

console.log('resolve-r2-upload-env tests passed');
