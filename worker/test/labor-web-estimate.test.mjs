import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLaborWeb, webEstimateResponsePayload } from '../src/integrations/labor-web-estimate.mjs';
import { createLaborGuideHandlers } from '../src/integrations/labor-guide.mjs';
import { HttpError } from '../src/http.mjs';
import { WEB_ESTIMATE_LABEL } from '../../src/modules/labor-guide.js';

function secretsStore(initial = {}) {
  const map = new Map(Object.entries(initial));
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

test('web search returns no estimate when API key missing', async () => {
  const result = await searchLaborWeb({}, {
    year: 2022, make: 'Ford', model: 'F-150', operation: 'brake pads',
  });
  assert.equal(result.found, false);
  assert.equal(result.message, 'no estimate found');
  assert.equal(result.reason, 'search_not_configured');
});

test('web search averages mocked Brave results and labels them', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    web: {
      results: [
        { title: 'Brake job', url: 'https://example.com/1', description: 'Labor time about 1.5 hours for front pads' },
        { title: 'Shop guide', url: 'https://example.com/2', description: 'Most techs book 1.2 to 2.0 hrs' },
        { title: 'Unrelated', url: 'https://example.com/3', description: 'Warranty coverage details' },
      ],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const result = await searchLaborWeb({
    LABOR_WEB_SEARCH_API_KEY: 'test-key',
    LABOR_WEB_SEARCH_PROVIDER: 'brave',
  }, {
    year: 2022, make: 'Ford', model: 'F-150', operation: 'front brake pads',
  }, { fetcher });

  assert.equal(result.found, true);
  assert.equal(result.label, WEB_ESTIMATE_LABEL);
  assert.equal(result.notBookTime, true);
  assert.ok(result.averageHours >= 1.2 && result.averageHours <= 2);
  assert.ok(result.sourceCount >= 2);

  const payload = webEstimateResponsePayload(result, { laborRate: 165 });
  assert.equal(payload.provider, 'web_estimate');
  assert.equal(payload.lines[0].source, 'web_estimate');
  assert.match(payload.lines[0].description, /not book time/i);
  assert.equal(payload.lines[0].laborGuide.notBookTime, true);
});

test('web search reports no estimate when snippets lack hours', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    web: { results: [{ title: 'Blog', url: 'https://example.com/x', description: 'How to choose brake pads' }] },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const result = await searchLaborWeb({
    LABOR_WEB_SEARCH_API_KEY: 'test-key',
  }, { year: 2018, make: 'Honda', model: 'Civic', operation: 'pads' }, { fetcher });
  assert.equal(result.found, false);
  assert.equal(result.message, 'no estimate found');
});

test('labor-guide search auto-falls back to web when no provider connected', async () => {
  const store = secretsStore();
  const handle = createLaborGuideHandlers({ ...store, requireRole });
  const context = { shopId: 'shop-1', role: 'service_writer', userId: 'u1' };
  const env = {
    LABOR_WEB_SEARCH_API_KEY: 'test-key',
    fetch: async () => new Response(JSON.stringify({
      web: {
        results: [
          { title: 'A', url: 'https://a.test', description: '2.0 hours labor' },
          { title: 'B', url: 'https://b.test', description: '1.5 hrs typical' },
        ],
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  };
  const response = await handle(new Request('https://example/api/integrations/labor-guide/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      year: 2020, make: 'Toyota', model: 'Camry', keyword: 'water pump', laborRate: 140,
    }),
  }), env, context, ['integrations', 'labor-guide', 'search']);
  const body = await response.json();
  assert.equal(body.provider, 'web_estimate');
  assert.equal(body.found, true);
  assert.match(body.label, /not book time/i);
  assert.equal(body.connected, false);
  assert.equal(body.lines[0].source, 'web_estimate');
});
