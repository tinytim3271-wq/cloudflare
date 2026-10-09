import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PartsProviderError,
  getPartsProviderStatus,
  getPartsPunchoutUrl,
  getPartsStatus,
  normalizePartsInput,
  orderParts,
  quoteParts,
  searchParts,
} from '../src/integrations/parts.mjs';

const partsTechEnv = {
  PARTSTECH_BASE_URL: 'https://parts.example.test/v1/',
  PARTSTECH_API_KEY: 'parts-secret',
  PARTSTECH_STATUS_PATH: 'status/{id}',
  PARTSTECH_SEARCH_PATH: 'catalog/search',
  PARTSTECH_QUOTE_PATH: 'quotes/{quoteId}',
  PARTSTECH_ORDER_PATH: 'orders',
  PARTSTECH_PUNCHOUT_URL: 'https://punchout.example.test/session',
};

test('provider registry status reports operations and never credentials', () => {
  const status = getPartsProviderStatus(partsTechEnv);
  assert.deepEqual(status.partstech, {
    provider: 'PartsTech',
    configured: true,
    hasPunchout: true,
    operations: {
      status: true,
      search: true,
      quote: true,
      order: true,
    },
    configurationError: null,
  });
  assert.equal(status.nexpart.configured, false);
  assert.equal(JSON.stringify(status).includes('parts-secret'), false);
});

test('PartsTech supports status and URL-encodes configured path identifiers', async () => {
  let request;
  const result = await getPartsStatus(partsTechEnv, 'partstech', {
    id: 'shop/order 1',
    detail: 'full',
  }, {
    fetch: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ connected: true }));
    },
  });

  assert.equal(request.url.pathname, '/v1/status/shop%2Forder%201');
  assert.equal(request.url.searchParams.get('detail'), 'full');
  assert.equal(request.init.method, 'GET');
  assert.ok(request.init.signal instanceof AbortSignal);
  assert.deepEqual(result, {
    provider: 'PartsTech',
    operation: 'status',
    data: { connected: true },
  });
});

test('PartsTech search, quote, and order use configured operations', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: url.toString(), init });
    return new Response(JSON.stringify({ results: [{ sku: 'PAD-1' }] }));
  };

  await searchParts(partsTechEnv, 'partstech', { query: 'brake pads' }, { fetch });
  await quoteParts(partsTechEnv, 'partstech', { quoteId: 'Q/42', items: [{ sku: 'PAD-1' }] }, { fetch });
  await orderParts(partsTechEnv, 'partstech', { quoteId: 'Q-42' }, { fetch });

  assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
    '/v1/catalog/search',
    '/v1/quotes/Q%2F42',
    '/v1/orders',
  ]);
  assert.ok(calls.every((call) => call.init.method === 'POST'));
  assert.ok(calls.every((call) => call.init.headers.Authorization === 'Bearer parts-secret'));
  assert.equal(JSON.stringify(calls.map((call) => call.init.body)).includes('parts-secret'), false);
});

test('Nexpart adapter accepts common JSON and bounds output arrays', async () => {
  const env = {
    NEXPART_BASE_URL: 'http://127.0.0.1:8787/api/',
    NEXPART_USERNAME: 'licensed-user',
    NEXPART_PASSWORD: 'licensed-password',
    NEXPART_SEARCH_PATH: 'search',
  };
  const items = Array.from({ length: 130 }, (_, index) => ({ id: index }));
  const result = await searchParts(env, 'nexpart', { query: 'filter' }, {
    fetch: async (_url, init) => {
      assert.match(init.headers.Authorization, /^Basic /);
      return new Response(JSON.stringify({ items }));
    },
  });

  assert.equal(result.provider, 'Nexpart');
  assert.equal(result.data.items.length, 100);
  assert.equal(JSON.stringify(result).includes('licensed-password'), false);
});

test('returns only validated configured punch-out URLs', () => {
  assert.equal(
    getPartsPunchoutUrl(partsTechEnv, 'partstech'),
    'https://punchout.example.test/session',
  );
  assert.equal(getPartsPunchoutUrl({}, 'nexpart'), null);
  assert.throws(
    () => getPartsPunchoutUrl({ NEXPART_PUNCHOUT_URL: 'http://vendor.example.test' }, 'nexpart'),
    (error) => error instanceof PartsProviderError && /HTTPS/.test(error.message),
  );
});

test('validates bounded input and reports unconfigured and HTTP errors', async () => {
  assert.throws(() => normalizePartsInput('filter'), /must be an object/);
  assert.equal(normalizePartsInput({ query: 'x'.repeat(700) }).query.length, 500);

  await assert.rejects(
    searchParts({}, 'partstech', { query: 'filter' }),
    (error) => error instanceof PartsProviderError && /not configured/.test(error.message),
  );
  await assert.rejects(
    orderParts(partsTechEnv, 'partstech', { quoteId: 'Q-42' }, {
      fetch: async () => new Response('conflict', { status: 409 }),
    }),
    (error) => error instanceof PartsProviderError
      && error.operation === 'order'
      && error.status === 409,
  );
});
