import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  MECHPRO_SYSTEM_PROMPT,
  calculateTextCost,
  executeGroundingTool,
  runAnthropicTurn,
  selectAnthropicModel,
  shouldEscalateToOpus,
} from '../src/ai.mjs';
import { AiChatSession } from '../src/chat-session.mjs';
import { buildDeepgramSettings } from '../src/voice-session.mjs';

function secret() {
  return crypto.randomUUID();
}

test('model routing defaults to Sonnet and explicitly supports Opus escalation', () => {
  const env = { ANTHROPIC_SONNET_MODEL: 'sonnet-test', ANTHROPIC_OPUS_MODEL: 'opus-test' };
  assert.deepEqual(selectAnthropicModel(env), {
    family: 'sonnet',
    model: 'sonnet-test',
    routingReason: 'default_sonnet',
  });
  assert.equal(selectAnthropicModel(env, { requestedModel: 'opus' }).model, 'opus-test');
  const hardDiagnostic = 'This intermittent CAN bus no-communication comeback is still failing after replacement. Review the scope waveform.';
  assert.equal(shouldEscalateToOpus(hardDiagnostic), true);
  assert.equal(selectAnthropicModel(env, { autoEscalate: true, message: hardDiagnostic }).family, 'opus');
  assert.throws(() => selectAnthropicModel(env, { requestedModel: 'small' }), /sonnet.*opus/);
});

test('system prompt requires detailed, evidence-grounded answers', () => {
  assert.match(MECHPRO_SYSTEM_PROMPT, /detailed/i);
  assert.match(MECHPRO_SYSTEM_PROMPT, /never guess/i);
  assert.match(MECHPRO_SYSTEM_PROMPT, /ask for the missing VIN/i);
  assert.match(MECHPRO_SYSTEM_PROMPT, /read-only/i);
});

test('grounding lookup is tenant-scoped and read-only', async () => {
  const statements = [];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            statements.push({ sql, args });
            return {
              async all() {
                return {
                  results: [{
                    entity_id: 'EST-100',
                    data_json: JSON.stringify({ id: 'EST-100', customer: 'Customer A', amount: 125 }),
                    updated_at: '2026-10-02T00:00:00.000Z',
                  }],
                };
              },
            };
          },
        };
      },
    },
  };
  const result = await executeGroundingTool(env, 'shop-a', 'lookup_estimate', { id: 'EST-100' });
  assert.equal(result.readOnly, true);
  assert.equal(result.records[0].amount, 125);
  assert.deepEqual(statements[0].args, ['shop-a', 'estimates', 'EST-100']);
  assert.match(statements[0].sql, /shop_id = \?/);
});

test('Anthropic turn executes read-only tools and accumulates token usage', async () => {
  const requests = [];
  const responses = [
    {
      content: [{ type: 'tool_use', id: 'tool-1', name: 'lookup_invoice', input: { id: 'INV-9' } }],
      usage: { input_tokens: 50, output_tokens: 10 },
    },
    {
      content: [{ type: 'text', text: 'Invoice INV-9 is open. The record does not include payment confirmation.' }],
      usage: { input_tokens: 80, output_tokens: 20 },
    },
  ];
  const env = {
    AI_ENABLED: '1',
    ANTHROPIC_API_KEY: secret(),
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return {
                  results: [{
                    entity_id: 'INV-9',
                    data_json: JSON.stringify({ id: 'INV-9', status: 'open' }),
                    updated_at: '2026-10-02T00:00:00.000Z',
                  }],
                };
              },
            };
          },
        };
      },
    },
  };
  const result = await runAnthropicTurn(env, {
    shopId: 'shop-a',
    message: 'Is INV-9 paid?',
    fetcher: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json(responses.shift());
    },
  });
  assert.equal(result.inputTokens, 130);
  assert.equal(result.outputTokens, 30);
  assert.match(result.text, /does not include payment confirmation/);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[1].body.messages.at(-1).content[0].type, 'tool_result');
  assert.match(requests[1].body.messages.at(-1).content[0].content, /"readOnly":true/);
});

test('cost calculation leaves unknown rates null and applies configured markup', () => {
  assert.deepEqual(calculateTextCost({}, 'sonnet', 1000, 500), {
    providerCostUsd: null,
    billedUsd: null,
  });
  assert.deepEqual(calculateTextCost({
    ANTHROPIC_SONNET_INPUT_USD_PER_MTOK: '2',
    ANTHROPIC_SONNET_OUTPUT_USD_PER_MTOK: '10',
    AI_BILLING_MARKUP_MULTIPLIER: '1.5',
  }, 'sonnet', 1_000_000, 500_000), {
    providerCostUsd: 7,
    billedUsd: 10.5,
  });
});

test('Deepgram settings use BYO Anthropic and do not expose the Deepgram credential', () => {
  const anthropicSecret = secret();
  const deepgramSecret = secret();
  const settings = buildDeepgramSettings({
    ANTHROPIC_API_KEY: anthropicSecret,
    DEEPGRAM_API_KEY: deepgramSecret,
  }, [{ type: 'orders', id: 'RO-1', status: 'open' }]);
  assert.equal(settings.agent.think.provider.type, 'anthropic');
  assert.equal(settings.agent.think.endpoint.headers['x-api-key'], anthropicSecret);
  assert.match(settings.agent.think.prompt, /RO-1/);
  assert.doesNotMatch(JSON.stringify(settings), new RegExp(deepgramSecret));
});

function assistantDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            async first() {
              if (/FROM users WHERE email/.test(sql)) {
                return { shop_id: 'shop-a', role: 'admin', name: 'Shop Admin', enabled: 1 };
              }
              if (/SELECT suspended FROM accounts/.test(sql)) return { suspended: 0 };
              if (/SELECT request_count FROM ai_rate_limits/.test(sql)) return { request_count: 1 };
              return null;
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function chatNamespace(env) {
  const sessions = new Map();
  return {
    idFromName(name) {
      return name;
    },
    get(id) {
      if (!sessions.has(id)) {
        const values = new Map();
        const state = {
          storage: {
            async get(key) { return values.get(key); },
            async put(key, value) { values.set(key, value); },
          },
        };
        sessions.set(id, new AiChatSession(state, env));
      }
      return sessions.get(id);
    },
  };
}

function assistantRequest() {
  return new Request('https://app.example.test/api/ai/assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MechPro-Dev-Email': 'admin@example.test',
    },
    body: JSON.stringify({ message: 'Explain this open estimate.', model: 'sonnet' }),
  });
}

test('authenticated assistant route calls Anthropic and records per-shop usage', async (t) => {
  const DB = assistantDb();
  const apiKey = secret();
  const provider = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(init.headers['x-api-key'], apiKey);
    return Response.json({
      content: [{ type: 'text', text: 'I need the estimate number before I can verify its details.' }],
      usage: { input_tokens: 12, output_tokens: 14 },
    });
  });
  const env = {
    DB,
    DEV_AUTH_BYPASS: '1',
    AI_ENABLED: '1',
    ANTHROPIC_API_KEY: apiKey,
  };
  env.AI_CHAT_SESSIONS = chatNamespace(env);
  const response = await worker.fetch(assistantRequest(), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.modelFamily, 'sonnet');
  assert.match(payload.sessionId, /^[a-f0-9-]{36}$/);
  assert.equal(payload.usage.inputTokens, 12);
  assert.equal(provider.mock.callCount(), 1);
  const usageInsert = DB.calls.find(call => /INSERT INTO ai_usage_events/.test(call.sql));
  assert.ok(usageInsert);
  assert.equal(usageInsert.args[1], 'shop-a');
  assert.equal(usageInsert.args[3], 'text');
  assert.equal(usageInsert.args[6], 12);
});

test('assistant feature flag fails closed before calling a provider', async (t) => {
  const provider = t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('disabled AI must not call a provider');
  });
  const response = await worker.fetch(assistantRequest(), {
    DB: assistantDb(),
    DEV_AUTH_BYPASS: '1',
    AI_ENABLED: '0',
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).message, /not enabled/);
  assert.equal(provider.mock.callCount(), 0);
});
