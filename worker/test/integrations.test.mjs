import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartstechHandlers } from '../src/integrations/partstech.mjs';
import { createLaborGuideHandlers } from '../src/integrations/labor-guide.mjs';
import { createQuickbooksHandlers } from '../src/integrations/quickbooks.mjs';
import { HttpError } from '../src/http.mjs';

function secretsStore() {
  const map = new Map();
  return {
    async saveSecret(_env, shopId, name, value) { map.set(`${shopId}:${name}`, value); },
    async getSecret(shopId, name) { return map.get(`${shopId}:${name}`) || ''; },
    async deleteSecret(_env, shopId, name) { map.delete(`${shopId}:${name}`); },
    map,
  };
}

function requireRole(context, roles) {
  if (!roles.includes(context.role) && context.role !== 'super_admin') {
    throw new HttpError(403, 'Forbidden');
  }
}

test('partstech quote fails closed when not connected', async () => {
  const store = secretsStore();
  const handle = createPartstechHandlers({
    ...store,
    requireRole,
  });
  const context = { shopId: 'shop-1', role: 'admin', userId: 'u1' };
  await assert.rejects(
    () => handle(new Request('https://example/api/integrations/partstech/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: 'pad', storeId: '1' }),
    }), {}, context, ['integrations', 'partstech', 'quote']),
    /not connected/i,
  );
});

test('labor guide search fails closed without MOTOR', async () => {
  const store = secretsStore();
  const handle = createLaborGuideHandlers({ ...store, requireRole });
  const context = { shopId: 'shop-1', role: 'service_writer', userId: 'u1' };
  await assert.rejects(
    () => handle(new Request('https://example/api/integrations/labor-guide/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vin: '1FT', keyword: 'brake' }),
    }), {}, context, ['integrations', 'labor-guide', 'search']),
    /not connected/i,
  );
});

test('quickbooks sync fails closed when not connected', async () => {
  const store = secretsStore();
  const handle = createQuickbooksHandlers({ ...store, requireRole });
  const context = { shopId: 'shop-1', role: 'admin', userId: 'u1' };
  await assert.rejects(
    () => handle(new Request('https://example/api/integrations/quickbooks/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: 'customer', localId: 'c1', customer: { name: 'Pat' } }),
    }), {}, context, ['integrations', 'quickbooks', 'sync']),
    /not connected/i,
  );
});

test('partstech connect stores encrypted-ready JSON secret payload', async () => {
  const store = secretsStore();
  const handle = createPartstechHandlers({ ...store, requireRole });
  const context = { shopId: 'shop-1', role: 'owner', userId: 'u1' };
  const response = await handle(new Request('https://example/api/integrations/partstech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      partnerId: 'p', partnerKey: 'pk', userId: 'u', userKey: 'uk', storeId: 'store-1',
    }),
  }), {}, context, ['integrations', 'partstech']);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.connected, true);
  assert.ok(store.map.get('shop-1:partstech-credentials'));
});
