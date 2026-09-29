import test from 'node:test';
import assert from 'node:assert/strict';

const OFFLINE_QUEUE_BLOCKED = /\/entities\/(employees|payrollentries|shopsettings|invoices|payments|expenses)(\/|$)/i;
let seq = 0;
function mutationId() {
  seq += 1;
  return `mut-${seq}`;
}

function prepareEntityMutation(path, options) {
  const method = String(options.method || 'GET').toUpperCase();
  const isEntityMutation = path.startsWith('/entities/') && ['POST', 'PUT', 'DELETE'].includes(method);
  const queueable = isEntityMutation && !OFFLINE_QUEUE_BLOCKED.test(path);
  if (!queueable) return { path, options, queueable: false };
  let body = null;
  if (options.body) {
    try { body = JSON.parse(options.body); } catch { body = null; }
  }
  if (method === 'POST' && body && typeof body === 'object' && !Array.isArray(body) && !body.id) {
    body = { ...body, id: mutationId() };
  }
  const entityKey = method === 'POST'
    ? (body && body.id ? `${path}/${body.id}` : `${path}/${mutationId()}`)
    : path;
  return {
    path,
    options: { ...options, method, body: body ? JSON.stringify(body) : undefined },
    queueable: Boolean(body) || method === 'DELETE',
    expectedUpdatedAt: method === 'PUT' ? body?.updatedAt : null,
    key: entityKey,
  };
}

test('POST without a body does not throw and is not queued', () => {
  assert.doesNotThrow(() => prepareEntityMutation('/entities/orders', { method: 'POST' }));
  const result = prepareEntityMutation('/entities/orders', { method: 'POST' });
  assert.equal(result.queueable, false);
  assert.match(result.key, /^\/entities\/orders\//);
});

test('POST with a body assigns an id and stays queueable', () => {
  const result = prepareEntityMutation('/entities/orders', {
    method: 'POST',
    body: JSON.stringify({ customer: 'Ada' }),
  });
  assert.equal(result.queueable, true);
  const parsed = JSON.parse(result.options.body);
  assert.ok(parsed.id);
  assert.equal(result.key, `/entities/orders/${parsed.id}`);
});

test('DELETE without a body remains queueable', () => {
  const result = prepareEntityMutation('/entities/orders/RO-1', { method: 'DELETE' });
  assert.equal(result.queueable, true);
  assert.equal(result.key, '/entities/orders/RO-1');
});

test('blocked payroll entities are never queued', () => {
  const result = prepareEntityMutation('/entities/payrollentries', {
    method: 'POST',
    body: JSON.stringify({ hours: 1 }),
  });
  assert.equal(result.queueable, false);
});
