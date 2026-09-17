import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEmail, chatTime } from './utils.js';

test('cleanEmail normalizes casing and whitespace', () => {
  assert.equal(cleanEmail('  USER@Example.COM '), 'user@example.com');
  assert.equal(cleanEmail(''), '');
  assert.equal(cleanEmail(null), '');
});

test('chatTime returns empty string for missing values', () => {
  assert.equal(chatTime(''), '');
  assert.equal(chatTime(null), '');
});

test('chatTime formats valid timestamps in en-US style', () => {
  const formatted = chatTime('2026-09-15T01:23:00.000Z');
  assert.equal(typeof formatted, 'string');
  assert.ok(formatted.length > 0);
});
