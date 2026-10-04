import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadFileToStorage } from './file-upload.js';

const blob = new Blob(['signature'], { type: 'image/png' });

function presign() {
  return { uploadUrl: 'https://example.test/api/files/upload?key=signature', key: 'signature' };
}

test('upload returns the R2 key after a successful PUT', async () => {
  const calls = [];
  const key = await uploadFileToStorage(blob, 'signature', 'image/png', {
    apiFetch: async (path, options) => {
      calls.push({ path, options });
      return presign();
    },
    fetchImpl: async (_url, options) => {
      calls.push(options);
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(key, 'signature');
  assert.equal(calls[0].path, '/files/presign-upload');
  assert.equal(JSON.parse(calls[0].options.body).contentLength, blob.size);
  assert.equal(calls[1].method, 'PUT');
});

test('upload surfaces the Worker JSON error message', async () => {
  await assert.rejects(
    () => uploadFileToStorage(blob, 'signature', 'image/png', {
      apiFetch: async () => presign(),
      fetchImpl: async () => Response.json(
        { message: 'File storage is temporarily unavailable. Try again.' },
        { status: 503 },
      ),
    }),
    { message: 'File storage is temporarily unavailable. Try again.' },
  );
});

test('upload includes the status when the failure body has no message', async () => {
  await assert.rejects(
    () => uploadFileToStorage(blob, 'signature', 'image/png', {
      apiFetch: async () => presign(),
      fetchImpl: async () => new Response(null, { status: 413 }),
    }),
    { message: 'Upload to storage failed (413)' },
  );
});
