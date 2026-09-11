import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEntityDeleteStatements } from '../src/routes/entities.mjs';
import { assertUploadContentType, assertUploadSize, handleFiles } from '../src/routes/files.mjs';
import { HttpError } from '../src/http.mjs';

function mockDb() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...args) {
          const entry = { sql, args };
          statements.push(entry);
          return entry;
        },
      };
    },
    async batch(items) {
      return items;
    },
  };
}

test('employee delete also revokes the Access user row', () => {
  const env = { DB: mockDb() };
  const context = { shopId: 'shop-1' };
  const existing = { id: 'emp-1', email: 'tech@shop.test', name: 'Tech' };
  const statements = buildEntityDeleteStatements(env, context, 'employees', 'emp-1', existing, []);
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /DELETE FROM entities/i);
  assert.match(statements[1].sql, /DELETE FROM users/i);
  assert.deepEqual(statements[1].args, ['tech@shop.test', 'shop-1']);
});

test('invoice delete removes linked payments without requiring employee branch', () => {
  const env = { DB: mockDb() };
  const context = { shopId: 'shop-1' };
  const existing = { id: 'inv-1', number: 'INV-1' };
  const payments = [
    { id: 'pay-1', invoiceNumber: 'INV-1' },
    { id: 'pay-2', invoiceNumber: 'INV-9' },
  ];
  const statements = buildEntityDeleteStatements(env, context, 'invoices', 'inv-1', existing, payments);
  assert.equal(statements.length, 2);
  assert.match(statements[1].sql, /DELETE FROM entities/i);
  assert.deepEqual(statements[1].args, ['shop-1', 'payments', 'pay-1']);
});

test('upload size guard rejects oversized and empty declarations', () => {
  assert.equal(assertUploadSize(1024), 1024);
  assert.throws(() => assertUploadSize(0), HttpError);
  assert.throws(() => assertUploadSize(20 * 1024 * 1024), HttpError);
});

test('upload content-type guard allows images and PDF only', () => {
  assert.equal(assertUploadContentType('image/png'), 'image/png');
  assert.equal(assertUploadContentType('application/pdf; charset=binary'), 'application/pdf');
  assert.throws(() => assertUploadContentType('text/html'), HttpError);
});

test('files route rejects keys outside the authenticated shop', async () => {
  const request = new Request('https://example.test/api/files/object?key=shops/other/file.png');
  const context = { shopId: 'shop-1', userId: 'u1' };
  await assert.rejects(
    () => handleFiles(request, { FILES: {} }, context, ['files', 'object']),
    (error) => error instanceof HttpError && error.status === 403,
  );
});
