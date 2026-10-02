import { HttpError } from './http.mjs';

export const DEFAULT_SONNET_MODEL = 'claude-sonnet-5';
export const DEFAULT_OPUS_MODEL = 'claude-opus-5';

const LOOKUP_TYPES = Object.freeze({
  lookup_job: 'orders',
  lookup_estimate: 'estimates',
  lookup_invoice: 'invoices',
  lookup_customer: 'customers',
  lookup_parts: 'inventory',
});

export const MECHPRO_SYSTEM_PROMPT = `You are MechPro's conversational assistant for professional automotive repair shops.

Give detailed, technically useful explanations rather than simplistic summaries. Accuracy is mandatory: never guess, hand-wave, or invent facts about shop operations, customers, vehicles, parts, labor, estimates, invoices, payments, appointments, or diagnostics. Use the available read-only MechPro tools whenever an answer depends on shop records. If the available records or technical evidence are insufficient, say exactly what is unknown and ask for the missing VIN, mileage, DTCs, scan data, test results, service information, or shop record.

Separate confirmed facts from hypotheses. For diagnostics, provide a safe, test-driven sequence and do not present a likely cause as a confirmed repair. Refer technicians to current OEM service information, wiring diagrams, specifications, and qualified verification for safety-critical work. Never claim that you changed a record, ordered a part, approved an estimate, collected payment, or completed another side effect; the available tools are read-only. Treat all shop and customer data as private and only use it to answer the current shop's request.`;

export const ANTHROPIC_TOOLS = Object.entries(LOOKUP_TYPES).map(([name, entityType]) => ({
  name,
  description: `Read ${entityType} records for the current shop. Use an exact MechPro record ID when available, otherwise provide a short search term. This tool never changes data.`,
  input_schema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Exact MechPro record ID.' },
      query: { type: 'string', description: 'Customer, vehicle, number, part, or other short search term.' },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    },
    additionalProperties: false,
  },
}));

export function isAiEnabled(env) {
  return ['1', 'true'].includes(String(env.AI_ENABLED || '').trim().toLowerCase());
}

export function shouldEscalateToOpus(message) {
  const text = String(message || '').toLowerCase();
  const diagnosticSignals = [
    /\b(intermittent|multiple modules|network fault|can bus|lin bus|no communication)\b/,
    /\b(scope|oscilloscope|waveform|voltage drop|parasitic draw)\b/,
    /\b(after (?:replacing|replacement)|still (?:fails|failing|faults)|comeback)\b/,
    /\b(hard diagnostic|escalate|second opinion|root cause)\b/,
  ];
  return diagnosticSignals.filter(pattern => pattern.test(text)).length >= 2;
}

export function selectAnthropicModel(env, { requestedModel = 'sonnet', autoEscalate = false, message = '' } = {}) {
  const requested = String(requestedModel || 'sonnet').trim().toLowerCase();
  if (!['sonnet', 'opus'].includes(requested)) {
    throw new HttpError(400, 'model must be "sonnet" or "opus"');
  }
  const escalate = requested === 'opus' || (autoEscalate && shouldEscalateToOpus(message));
  return {
    family: escalate ? 'opus' : 'sonnet',
    model: escalate
      ? String(env.ANTHROPIC_OPUS_MODEL || DEFAULT_OPUS_MODEL)
      : String(env.ANTHROPIC_SONNET_MODEL || DEFAULT_SONNET_MODEL),
    routingReason: requested === 'opus'
      ? 'requested_opus'
      : escalate ? 'auto_escalated_diagnostics' : 'default_sonnet',
  };
}

function parseEntity(row) {
  try {
    return JSON.parse(row.data_json);
  } catch {
    return null;
  }
}

export async function executeGroundingTool(env, shopId, name, input = {}) {
  const entityType = LOOKUP_TYPES[name];
  if (!entityType) return { error: 'Unknown read-only MechPro tool.' };
  const id = String(input.id || '').trim().slice(0, 160);
  const query = String(input.query || '').trim().toLowerCase().slice(0, 160);
  const limit = Math.min(10, Math.max(1, Number(input.limit) || 5));
  if (!id && !query) {
    return { error: 'Provide an exact record id or a search query.' };
  }
  const result = id
    ? await env.DB.prepare(
      'SELECT entity_id, data_json, updated_at FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ? LIMIT 1',
    ).bind(shopId, entityType, id).all()
    : await env.DB.prepare(
      'SELECT entity_id, data_json, updated_at FROM entities WHERE shop_id = ? AND entity_type = ? AND lower(data_json) LIKE ? ORDER BY updated_at DESC LIMIT ?',
    ).bind(shopId, entityType, `%${query}%`, limit).all();
  const records = (result.results || []).map(row => {
    const record = parseEntity(row);
    return record ? { ...record, id: record.id || row.entity_id, updatedAt: record.updatedAt || row.updated_at } : null;
  }).filter(Boolean);
  return { entityType, records, count: records.length, readOnly: true };
}

function normalizeHistory(history) {
  return (Array.isArray(history) ? history : []).slice(-10).map(entry => ({
    role: entry.role === 'assistant' || entry.direction === 'outbound' ? 'assistant' : 'user',
    content: String(typeof entry.content === 'string' ? entry.content : entry.content?.[0]?.text || '').slice(0, 4000),
  })).filter(entry => entry.content);
}

async function anthropicRequest(env, payload, fetcher) {
  const response = await fetcher('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({
      message: 'Anthropic Messages API request failed',
      status: response.status,
      type: body?.error?.type || 'unknown',
    }));
    throw new HttpError(502, 'The MechPro assistant provider is unavailable');
  }
  return body;
}

export async function runAnthropicTurn(env, {
  shopId,
  message,
  history = [],
  requestedModel = 'sonnet',
  autoEscalate = false,
  fetcher = fetch,
} = {}) {
  if (!isAiEnabled(env)) throw new HttpError(503, 'MechPro AI is not enabled');
  if (!String(env.ANTHROPIC_API_KEY || '').trim()) throw new HttpError(503, 'MechPro AI is not configured');

  const route = selectAnthropicModel(env, { requestedModel, autoEscalate, message });
  const messages = [...normalizeHistory(history), { role: 'user', content: String(message) }];
  let inputTokens = 0;
  let outputTokens = 0;
  let response;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await anthropicRequest(env, {
      model: route.model,
      max_tokens: Math.min(4096, Math.max(256, Number(env.ANTHROPIC_MAX_TOKENS) || 1600)),
      temperature: 0.2,
      system: MECHPRO_SYSTEM_PROMPT,
      tools: ANTHROPIC_TOOLS,
      messages,
    }, fetcher);
    inputTokens += Number(response.usage?.input_tokens || 0);
    outputTokens += Number(response.usage?.output_tokens || 0);
    const toolCalls = (response.content || []).filter(block => block.type === 'tool_use');
    if (!toolCalls.length) break;
    messages.push({ role: 'assistant', content: response.content });
    const toolResults = [];
    for (const call of toolCalls) {
      const result = await executeGroundingTool(env, shopId, call.name, call.input);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: JSON.stringify(result),
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  const text = (response?.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  if (!text) throw new HttpError(502, 'The MechPro assistant did not return a final answer');
  return { text, ...route, inputTokens, outputTokens };
}

function finiteRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function calculateTextCost(env, family, inputTokens, outputTokens) {
  const prefix = family === 'opus' ? 'ANTHROPIC_OPUS' : 'ANTHROPIC_SONNET';
  const inputRate = finiteRate(env[`${prefix}_INPUT_USD_PER_MTOK`]);
  const outputRate = finiteRate(env[`${prefix}_OUTPUT_USD_PER_MTOK`]);
  if (inputRate === null || outputRate === null) return { providerCostUsd: null, billedUsd: null };
  const providerCostUsd = ((Number(inputTokens) * inputRate) + (Number(outputTokens) * outputRate)) / 1_000_000;
  const markup = finiteRate(env.AI_BILLING_MARKUP_MULTIPLIER);
  return {
    providerCostUsd,
    billedUsd: markup === null ? null : providerCostUsd * markup,
  };
}

export function calculateVoiceCost(env, voiceSeconds) {
  const perMinute = finiteRate(env.DEEPGRAM_VOICE_USD_PER_MINUTE);
  if (perMinute === null) return { providerCostUsd: null, billedUsd: null };
  const providerCostUsd = (Number(voiceSeconds) / 60) * perMinute;
  const markup = finiteRate(env.AI_BILLING_MARKUP_MULTIPLIER);
  return {
    providerCostUsd,
    billedUsd: markup === null ? null : providerCostUsd * markup,
  };
}

export async function recordAiUsage(env, {
  shopId,
  userId = null,
  channel,
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
  voiceSeconds = 0,
  providerCostUsd = null,
  billedUsd = null,
  metadata = {},
}) {
  await env.DB.prepare(`
    INSERT INTO ai_usage_events (
      id, shop_id, user_id, channel, provider, model, input_tokens, output_tokens,
      voice_seconds, provider_cost_usd, billed_usd, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(), shopId, userId, channel, provider, model,
    Math.max(0, Math.floor(Number(inputTokens) || 0)),
    Math.max(0, Math.floor(Number(outputTokens) || 0)),
    Math.max(0, Number(voiceSeconds) || 0),
    providerCostUsd,
    billedUsd,
    JSON.stringify(metadata),
    new Date().toISOString(),
  ).run();
}

export async function loadVoiceShopContext(env, shopId) {
  const result = await env.DB.prepare(`
    SELECT entity_type, entity_id, data_json, updated_at
    FROM entities
    WHERE shop_id = ? AND entity_type IN ('orders', 'estimates', 'invoices', 'customers', 'vehicles', 'appointments', 'inventory')
    ORDER BY updated_at DESC
    LIMIT 40
  `).bind(shopId).all();
  return (result.results || []).map(row => {
    const record = parseEntity(row) || {};
    return {
      type: row.entity_type,
      id: record.id || row.entity_id,
      name: record.name || record.customer || record.number || '',
      status: record.status || '',
      vehicle: record.vehicle || '',
      amount: record.amount ?? record.total ?? null,
      updatedAt: row.updated_at,
    };
  });
}
