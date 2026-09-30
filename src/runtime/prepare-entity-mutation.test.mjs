import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEntityMutation } from './prepare-entity-mutation.js';
let seq = 0;
function mutationId() {
  seq += 1;
  return `mut-${seq}`;
}

test('POST without a body does not throw and is not queued', () => {
  assert.doesNotThrow(() => prepareEntityMutation('/entities/orders', { method: 'POST' }, mutationId));
  const result = prepareEntityMutation('/entities/orders', { method: 'POST' }, mutationId);
  assert.equal(result.queueable, false);
  assert.match(result.key, /^\/entities\/orders\//);
});

test('POST with a body assigns an id and stays queueable', () => {
  const result = prepareEntityMutation('/entities/orders', {
    method: 'POST',
    body: JSON.stringify({ customer: 'Ada' }),
  }, mutationId);
  assert.equal(result.queueable, true);
  const parsed = JSON.parse(result.options.body);
  assert.ok(parsed.id);
  assert.equal(result.key, `/entities/orders/${parsed.id}`);
});

test('DELETE without a body remains queueable', () => {
  const result = prepareEntityMutation('/entities/orders/RO-1', { method: 'DELETE' }, mutationId);
  assert.equal(result.queueable, true);
  assert.equal(result.key, '/entities/orders/RO-1');
});

test('blocked payroll entities are never queued', () => {
  const result = prepareEntityMutation('/entities/payrollentries', {
    method: 'POST',
    body: JSON.stringify({ hours: 1 }),
  }, mutationId);
  assert.equal(result.queueable, false);
});
