import coverageBundle from '../data/coverage.json' with { type: 'json' };
import {
  ENTITY_TYPES,
  buildTaxReport,
  canReadEntity,
  canWriteEntity,
  normalizeEntityPayload,
  normalizeEntityType,
  openInvoiceBalance,
  redactEmployee,
  validShopId,
  validVin,
} from './domain.mjs';
import {
  base64UrlEncode,
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  hmacBase64Url,
  hmacHex,
  verifyAccessJwt,
} from './security.mjs';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const SHOP_ROLES = new Set(['admin', 'technician', 'office', 'service_writer']);
const MUTATING_DIAGNOSTIC_PROCEDURES = new Set([
  'clear_dtcs', 'clearDtcs', 'program_key', 'add_key', 'all_keys_lost',
  'program_remote', 'erase_keys', 'flash', 'uds_write',
]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { ...JSON_HEADERS, ...headers } });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }
}

async function requestJson(request) {
  const text = await request.text();
  return text ? parseJson(text) : {};
}

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const configured = String(env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
  if (new URL(request.url).origin === origin || configured.includes(origin)) return origin;
  return null;
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = allowedOrigin(request, env);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function resolveContext(request, env) {
  let claims;
  if (env.DEV_AUTH_BYPASS === '1' && request.headers.get('X-MechPro-Dev-Email')) {
    claims = {
      sub: request.headers.get('X-MechPro-Dev-Sub') || 'local-development',
      email: request.headers.get('X-MechPro-Dev-Email'),
      name: request.headers.get('X-MechPro-Dev-Name') || 'Local Developer',
    };
  } else {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) throw new HttpError(401, 'Cloudflare Access authentication is required');
    try {
      claims = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
    } catch (error) {
      throw new HttpError(401, error instanceof Error ? error.message : 'Invalid Cloudflare Access session');
    }
  }
  const email = String(claims.email || '').trim().toLowerCase();
  if (!email) throw new HttpError(401, 'Cloudflare Access identity has no email claim');
  const superAdmins = String(env.ACCESS_ADMIN_EMAILS || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
  if (superAdmins.includes(email)) {
    return { shopId: 'platform', role: 'super_admin', userId: String(claims.sub || email), email, name: claims.name || 'Platform Administrator', claims };
  }
  const mapping = await env.DB.prepare(
    'SELECT shop_id, role, name, enabled FROM users WHERE email = ? COLLATE NOCASE',
  ).bind(email).first();
  if (!mapping || Number(mapping.enabled) !== 1) throw new HttpError(403, 'No active MechPro account is mapped to this Access identity');
  return {
    shopId: mapping.shop_id,
    role: mapping.role,
    userId: String(claims.sub || email),
    email,
    name: mapping.name || claims.name || email,
    claims,
  };
}

function requireRole(context, roles) {
  if (!roles.includes(context.role)) throw new HttpError(403, `Role ${context.role} is not permitted for this action`);
}

async function requireActiveAccount(context, env) {
  if (context.role === 'super_admin') return;
  const account = await env.DB.prepare(
    'SELECT suspended FROM accounts WHERE shop_id = ?',
  ).bind(context.shopId).first();
  if (account && Number(account.suspended) === 1) throw new HttpError(403, 'Customer account is suspended');
}

function entityRecord(row) {
  return row ? parseJson(row.data_json) : null;
}

async function getEntity(env, shopId, type, id) {
  return entityRecord(await env.DB.prepare(
    'SELECT data_json FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
  ).bind(shopId, type, id).first());
}

async function listEntities(env, shopId, type) {
  const result = await env.DB.prepare(
    'SELECT data_json FROM entities WHERE shop_id = ? AND entity_type = ? ORDER BY updated_at',
  ).bind(shopId, type).all();
  return result.results.map(entityRecord);
}

async function putEntity(env, context, type, id, body, expectedUpdatedAt = null, createdBy = context.userId) {
  const now = new Date().toISOString();
  const existing = await env.DB.prepare(
    'SELECT created_at, created_by, updated_at FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
  ).bind(context.shopId, type, id).first();
  if (expectedUpdatedAt && existing && existing.updated_at !== expectedUpdatedAt) {
    throw new HttpError(409, 'Record changed while this device was offline');
  }
  const record = {
    ...body,
    id,
    shopId: context.shopId,
    createdBy: existing?.created_by || createdBy,
    createdAt: body.createdAt || existing?.created_at || now,
    updatedAt: now,
  };
  await env.DB.prepare(`
    INSERT INTO entities (shop_id, entity_type, entity_id, data_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shop_id, entity_type, entity_id) DO UPDATE SET
      data_json = excluded.data_json,
      updated_at = excluded.updated_at
  `).bind(context.shopId, type, id, JSON.stringify(record), record.createdBy, record.createdAt, now).run();
  return record;
}

async function syncAccessUser(env, context, employee) {
  const email = String(employee.email || '').trim().toLowerCase();
  const role = String(employee.role || 'technician');
  if (!email || !SHOP_ROLES.has(role)) throw new HttpError(400, 'Employee email and a valid role are required');
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO users (email, shop_id, role, name, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      shop_id = excluded.shop_id,
      role = excluded.role,
      name = excluded.name,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `).bind(
    email,
    context.shopId,
    role,
    String(employee.name || email),
    employee.active === false ? 0 : 1,
    now,
    now,
  ).run();
}

function members(record) {
  return [...new Set((Array.isArray(record?.memberEmails) ? record.memberEmails : [])
    .map(email => String(email).trim().toLowerCase()).filter(Boolean))];
}

async function handleEntities(request, env, context, segments) {
  const sourceType = String(segments[1] || '').toLowerCase();
  const type = normalizeEntityType(sourceType);
  const id = segments[2] ? decodeURIComponent(segments.slice(2).join('/')) : null;
  if (!ENTITY_TYPES.has(type)) throw new HttpError(404, `Unknown entity type: ${type}`);
  if (request.method === 'GET' && !canReadEntity(type, context.role)) throw new HttpError(403, `Role ${context.role} cannot read ${type}`);
  if (request.method !== 'GET' && !canWriteEntity(type, context.role)) throw new HttpError(403, `Role ${context.role} cannot modify ${type}`);

  if (request.method === 'GET' && !id) {
    let records = await listEntities(env, context.shopId, type);
    if (type === 'conversations') records = records.filter(record => members(record).includes(context.email));
    if (type === 'chatmessages') {
      const allowed = new Set((await listEntities(env, context.shopId, 'conversations'))
        .filter(record => members(record).includes(context.email)).map(record => record.id));
      records = records.filter(record => allowed.has(record.conversationId));
    }
    if (type === 'employees') records = records.map(record => redactEmployee(record, context.role));
    return json(records);
  }
  if (request.method === 'GET' && id) {
    const record = await getEntity(env, context.shopId, type, id);
    if (!record) throw new HttpError(404, 'Not found');
    if (type === 'conversations' && !members(record).includes(context.email)) throw new HttpError(404, 'Not found');
    if (type === 'chatmessages') {
      const conversation = await getEntity(env, context.shopId, 'conversations', record.conversationId);
      if (!conversation || !members(conversation).includes(context.email)) throw new HttpError(404, 'Not found');
    }
    return json(type === 'employees' ? redactEmployee(record, context.role) : record);
  }
  if (request.method === 'POST' && !id) {
    let body = normalizeEntityPayload(sourceType, await requestJson(request));
    const naturalId = type === 'invoices' ? body.number : type === 'customers' ? body.name : null;
    const newId = String(body.id || naturalId || crypto.randomUUID());
    if (type === 'conversations') {
      if (!['direct', 'group'].includes(body.kind)) throw new HttpError(400, 'Conversation kind must be direct or group');
      if (body.kind === 'group' && context.role !== 'admin') throw new HttpError(403, 'Only owners can create group conversations');
      const memberEmails = members(body);
      if (!memberEmails.includes(context.email) || memberEmails.length < 2) {
        throw new HttpError(400, 'Conversation requires the creator and at least one other member');
      }
      body = { ...body, memberEmails, creatorEmail: context.email };
    }
    if (type === 'chatmessages') {
      const conversation = await getEntity(env, context.shopId, 'conversations', String(body.conversationId || ''));
      if (!conversation || !members(conversation).includes(context.email) || !String(body.body || '').trim()) {
        throw new HttpError(404, 'Conversation not found');
      }
      body = { ...body, body: String(body.body).trim().slice(0, 4000), memberEmails: members(conversation), senderEmail: context.email };
    }
    const saved = await putEntity(env, context, type, newId, body);
    if (type === 'employees') await syncAccessUser(env, context, saved);
    return json(saved, 201);
  }
  if (request.method === 'PUT' && id) {
    let body = normalizeEntityPayload(sourceType, await requestJson(request));
    if (type === 'chatmessages') throw new HttpError(405, 'Chat messages cannot be edited');
    if (type === 'conversations') {
      const existing = await getEntity(env, context.shopId, type, id);
      if (!existing || !members(existing).includes(context.email)) throw new HttpError(404, 'Conversation not found');
      if (existing.kind !== 'group' || context.role !== 'admin') throw new HttpError(403, 'Only owners can edit group conversations');
      const memberEmails = members(body);
      if (!memberEmails.includes(context.email) || memberEmails.length < 2) throw new HttpError(400, 'Group requires the owner and at least one other member');
      body = { ...body, memberEmails, creatorEmail: existing.creatorEmail };
    }
    const saved = await putEntity(env, context, type, id, body, request.headers.get('If-Match'));
    if (type === 'employees') await syncAccessUser(env, context, saved);
    return json(saved);
  }
  if (request.method === 'DELETE' && id) {
    const existing = await getEntity(env, context.shopId, type, id);
    if (!existing) throw new HttpError(404, 'Not found');
    if (['conversations', 'chatmessages'].includes(type)
      && (!members(existing).includes(context.email) || (context.role !== 'admin' && existing.createdBy !== context.userId))) {
      throw new HttpError(403, 'Not permitted');
    }
    if (type === 'customers') {
      const linkedTypes = ['vehicles', 'orders', 'invoices'];
      const lists = await Promise.all(linkedTypes.map(linkedType => listEntities(env, context.shopId, linkedType)));
      if (lists.flat().some(record => record.customer === existing.name)) {
        throw new HttpError(409, "Delete this customer's vehicles, work orders, and invoices first");
      }
    }
    const statements = [env.DB.prepare(
      'DELETE FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
    ).bind(context.shopId, type, id)];
    if (type === 'invoices') {
      const payments = await listEntities(env, context.shopId, 'payments');
      for (const payment of payments.filter(record => record.invoiceNumber === (existing.number || existing.id))) {
        statements.push(env.DB.prepare(
          'DELETE FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
        ).bind(context.shopId, 'payments', payment.id));
      }
      if (type === 'employees' && existing.email) {
        statements.push(env.DB.prepare(
          'DELETE FROM users WHERE email = ? COLLATE NOCASE AND shop_id = ?',
        ).bind(existing.email, context.shopId));
      }
    }
    await env.DB.batch(statements);
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function handleAuthSession(context) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return json({
    claims: {
      sub: context.userId,
      email: context.email,
      name: context.name,
      'custom:shopId': context.shopId,
      'custom:role': context.role,
      exp: expires,
    },
    expiresAt: expires * 1000,
  });
}

async function handleVin(request, env, context, vin) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  vin = String(vin || '').trim().toUpperCase();
  if (!validVin(vin)) throw new HttpError(400, 'VIN must contain 17 valid characters');
  const cached = await getEntity(env, context.shopId, 'vindecodes', vin);
  if (cached?.decoded) return json({ ...cached.decoded, cached: true });
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new HttpError(502, 'Vehicle data provider is unavailable');
  const result = (await response.json()).Results?.[0] || {};
  const value = key => String(result[key] || '').trim();
  const decoded = {
    vin: value('VIN').toUpperCase(), year: value('ModelYear'), make: value('Make'), model: value('Model'),
    trim: value('Trim'), vehicleType: value('VehicleType'), bodyClass: value('BodyClass'),
    driveType: value('DriveType'), fuelType: value('FuelTypePrimary'),
    engineCylinders: value('EngineCylinders'), engineDisplacementLiters: value('DisplacementL'),
    manufacturer: value('Manufacturer'), plantCountry: value('PlantCountry'),
    errorCode: value('ErrorCode'), errorText: value('ErrorText'),
  };
  if (!decoded.make && !decoded.model && !decoded.year) throw new HttpError(422, decoded.errorText || 'No vehicle details were found for this VIN');
  await putEntity(env, context, 'vindecodes', vin, { decoded, source: 'NHTSA vPIC' });
  return json({ ...decoded, cached: false });
}

async function handleCoverage(request, segments) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (segments[2] === 'bundle') return json(coverageBundle);
  const url = new URL(request.url);
  const platform = String(url.searchParams.get('platform') || '').trim();
  const year = Number(url.searchParams.get('year') || 0);
  if (!platform) return json(coverageBundle);
  const records = coverageBundle.records;
  const exact = records.find(record => record.platform.toUpperCase() === platform.toUpperCase()
    && (!year || (year >= record.yearRange[0] && year <= record.yearRange[1])));
  const match = exact || records.find(record => record.platform.toUpperCase() === platform.toUpperCase());
  if (!match) throw new HttpError(404, 'No coverage record found');
  return json(match);
}

async function handleDiagnostics(request, env, context, segments) {
  const action = segments[1];
  if (action === 'coverage') return handleCoverage(request, segments);
  requireRole(context, ['admin', 'technician', 'service_writer']);
  if (action === 'audit' && request.method === 'POST') {
    const event = await requestJson(request);
    ['pin', 'token', 'securityToken', 'password', 'credential'].forEach(key => {
      if (key in event) event[key] = '[REDACTED]';
    });
    const id = `audit-${Date.now()}-${crypto.randomUUID()}`;
    await env.DB.prepare(
      'INSERT INTO audit_log (id, shop_id, actor_id, actor_email, event_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, context.shopId, context.userId, context.email, JSON.stringify(event), new Date().toISOString()).run();
    return json({ id, recorded: true }, 201);
  }
  if (action === 'authorize' && request.method === 'POST') {
    const body = await requestJson(request);
    const vin = String(body.vin || '').trim().toUpperCase();
    const procedure = String(body.procedure || '').trim();
    if (!vin || !procedure || !/^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin)) throw new HttpError(400, 'vin and procedure are required and must be valid');
    if (MUTATING_DIAGNOSTIC_PROCEDURES.has(procedure) && !['clear_dtcs', 'clearDtcs'].includes(procedure)) {
      return json({ message: 'OEM AutoAuth integration is not configured.', authorized: false }, 501);
    }
    if (!['clear_dtcs', 'clearDtcs'].includes(procedure)) throw new HttpError(400, 'Unsupported procedure for local authorization');
    if (!env.DIAGNOSTICS_CAPABILITY_SECRET) throw new HttpError(503, 'Diagnostics capability signing is not configured');
    const payload = {
      v: 1, procedure: 'clear_dtcs', vin, shopId: context.shopId,
      exp: Date.now() + 5 * 60 * 1000, jti: crypto.randomUUID().replaceAll('-', ''),
    };
    const payloadJson = JSON.stringify(payload);
    const token = `v1.${base64UrlEncode(new TextEncoder().encode(payloadJson))}.${await hmacBase64Url(env.DIAGNOSTICS_CAPABILITY_SECRET, payloadJson)}`;
    return json({ authorized: true, procedure: 'clear_dtcs', vin, token, expiresAt: new Date(payload.exp).toISOString(), shopId: context.shopId });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function handleOnboarding(request, env, context) {
  requireRole(context, ['admin']);
  const records = await env.DB.prepare(
    "SELECT entity_type, entity_id, data_json FROM entities WHERE shop_id = ? AND entity_type != 'employees'",
  ).bind(context.shopId).all();
  const samples = records.results.filter(row => {
    const record = entityRecord(row);
    return record.sampleData === true
      || ['RO-1044', 'RO-1046', 'RO-1048', 'RO-1049', 'RO-1050', 'RO-1051', 'RO-1052'].includes(record.id)
      || ['INV-2032', 'INV-2036', 'INV-2040', 'INV-2041'].includes(record.number);
  });
  if (request.method === 'GET') return json({ sampleRecords: samples.length });
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const body = await requestJson(request);
  const resetAll = body.mode === 'all' && body.confirmation === 'DELETE ALL DATA';
  if (body.mode === 'all' && !resetAll) throw new HttpError(400, 'Type DELETE ALL DATA to confirm the reset');
  const targets = resetAll ? records.results : samples;
  if (targets.length) {
    await env.DB.batch(targets.map(row => env.DB.prepare(
      'DELETE FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
    ).bind(context.shopId, row.entity_type, row.entity_id)));
  }
  const startedAt = new Date().toISOString();
  await putEntity(env, context, 'shopsettings', 'onboarding', {
    startedAt, sampleRecordsRemoved: resetAll ? 0 : targets.length, allShopDataRemoved: resetAll,
  });
  return json({ startedAt, removed: targets.length, mode: resetAll ? 'all' : 'samples' });
}

async function handlePayroll(request, env, context) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  requireRole(context, ['admin', 'office']);
  const [orders, employees] = await Promise.all([
    listEntities(env, context.shopId, 'orders'),
    listEntities(env, context.shopId, 'employees'),
  ]);
  const now = new Date();
  const day = (now.getUTCDay() + 6) % 7;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - day);
  const period = monday.toISOString().slice(0, 10);
  const entries = orders.flatMap(order => {
    if (!['completed', 'invoiced'].includes(order.status)) return [];
    const employee = employees.find(item => item.active && item.techName === order.tech);
    const hours = Number(order.laborHours ?? (Number(order.labor || 0) / 165));
    if (!employee || !hours) return [];
    return [{
      id: `${period}#${order.id}`, workOrderId: order.id, employeeId: employee.id,
      periodKey: period, hours, rate: Number(employee.payRate || 0),
      grossPay: employee.employmentType === 'Hourly' ? Math.round(hours * Number(employee.payRate || 0) * 100) / 100 : 0,
      syncedAt: now.toISOString(),
    }];
  });
  for (const entry of entries) await putEntity(env, context, 'payrollentries', entry.id, entry);
  return json({ period, postedEntries: entries.length });
}

async function handleTaxReport(request, env, context) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  requireRole(context, ['admin', 'office']);
  const url = new URL(request.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to) throw new HttpError(400, 'from and to query parameters are required (YYYY-MM-DD)');
  const [payments, invoices, settings] = await Promise.all([
    listEntities(env, context.shopId, 'payments'),
    listEntities(env, context.shopId, 'invoices'),
    getEntity(env, context.shopId, 'shopsettings', 'tax'),
  ]);
  const tax = settings || { state: 'TX', rate: 8.25, taxId: '', filingFrequency: 'Monthly' };
  return json({ from, to, state: tax.state, taxId: tax.taxId, filingFrequency: tax.filingFrequency, ...buildTaxReport(payments, invoices, Number(tax.rate || 0), from, to) });
}

async function enforceAiRateLimit(env, context) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO ai_rate_limits (shop_id, user_id, window_start, request_count) VALUES (?, ?, ?, 1)
    ON CONFLICT(shop_id, user_id) DO UPDATE SET
      window_start = CASE WHEN ? - window_start >= 60000 THEN ? ELSE window_start END,
      request_count = CASE WHEN ? - window_start >= 60000 THEN 1 ELSE request_count + 1 END
  `).bind(context.shopId, context.userId, now, now, now, now).run();
  const row = await env.DB.prepare(
    'SELECT request_count FROM ai_rate_limits WHERE shop_id = ? AND user_id = ?',
  ).bind(context.shopId, context.userId).first();
  if (Number(row?.request_count || 0) > 30) throw new HttpError(429, 'Assistant rate limit exceeded. Try again in a minute.');
}

async function shopContext(env, shopId) {
  const result = await env.DB.prepare(
    "SELECT entity_type, data_json FROM entities WHERE shop_id = ? AND entity_type != 'employees' ORDER BY updated_at DESC LIMIT 120",
  ).bind(shopId).all();
  return result.results.map(row => {
    const item = entityRecord(row);
    return {
      type: row.entity_type, id: item.id, name: item.name, status: item.status, customer: item.customer,
      vehicle: item.vehicle, amount: item.amount, due: item.due, technician: item.tech,
      promise: item.promise, concern: item.complaint,
    };
  });
}

async function aiAnswer(env, shopId, message, history = []) {
  const context = await shopContext(env, shopId);
  const system = `You are MechPro Assistant for an automotive repair shop. Be concise and conversational. Never invent customer records, prices, availability, payment status, or repair certainty. Treat shop data as private. For safety-critical automotive questions, recommend current manufacturer service information and qualified technician verification. Shop data: ${JSON.stringify(context)}`;
  const messages = [
    { role: 'system', content: system },
    ...history.slice(-10).map(entry => ({
      role: entry.role === 'assistant' || entry.direction === 'outbound' ? 'assistant' : 'user',
      content: typeof entry.content === 'string' ? entry.content : String(entry.content?.[0]?.text || ''),
    })).filter(entry => entry.content),
    { role: 'user', content: message },
  ];
  const model = env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const result = await env.AI.run(model, { messages, max_tokens: 700, temperature: 0.3 });
  return { text: result.response || 'I could not produce an answer right now.', model };
}

async function handleAssistant(request, env, context) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  requireRole(context, ['admin', 'office', 'service_writer', 'technician']);
  await enforceAiRateLimit(env, context);
  const body = await requestJson(request);
  const message = String(body.message || '').trim().slice(0, 4000);
  if (!message) throw new HttpError(400, 'A message is required');
  const result = await aiAnswer(env, context.shopId, message, Array.isArray(body.history) ? body.history : []);
  return json({ message: result.text, model: result.model });
}

async function saveIntegrationSecret(env, shopId, name, value) {
  const encrypted = await encryptSecret(value, env.INTEGRATION_ENCRYPTION_KEY);
  await env.DB.prepare(`
    INSERT INTO integration_secrets (shop_id, secret_name, ciphertext, iv, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(shop_id, secret_name) DO UPDATE SET ciphertext = excluded.ciphertext, iv = excluded.iv, updated_at = excluded.updated_at
  `).bind(shopId, name, encrypted.ciphertext, encrypted.iv, new Date().toISOString()).run();
}

async function getIntegrationSecret(env, shopId, name) {
  const row = await env.DB.prepare(
    'SELECT ciphertext, iv FROM integration_secrets WHERE shop_id = ? AND secret_name = ?',
  ).bind(shopId, name).first();
  return row ? decryptSecret(row.ciphertext, row.iv, env.INTEGRATION_ENCRYPTION_KEY) : '';
}

async function handleAgentPhoneConfigure(request, env, context) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  requireRole(context, ['admin']);
  const body = await requestJson(request);
  const apiKey = String(body.apiKey || '').trim();
  const agentId = String(body.agentId || '').trim();
  if (!/^ap_[A-Za-z0-9_-]{12,}$/.test(apiKey)) throw new HttpError(400, 'Enter a valid AgentPhone API key');
  if (!/^agt_[A-Za-z0-9_-]{3,128}$/.test(agentId)) throw new HttpError(400, 'Enter a valid AgentPhone agent ID beginning with agt_');
  const contextLimit = Math.min(50, Math.max(0, Number(body.contextLimit ?? 10) || 10));
  const timeout = Math.min(120, Math.max(5, Number(body.timeout ?? 30) || 30));
  const webhookUrl = `${new URL(request.url).origin}/api/agentphone/webhook/${encodeURIComponent(context.shopId)}`;
  const response = await fetch(`https://api.agentphone.ai/v1/agents/${encodeURIComponent(agentId)}/webhook`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl, contextLimit, timeout }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secret) throw new HttpError(502, result.message || 'AgentPhone rejected the webhook configuration');
  await Promise.all([
    saveIntegrationSecret(env, context.shopId, 'agentphone-api-key', apiKey),
    saveIntegrationSecret(env, context.shopId, 'agentphone-webhook-secret', result.secret),
    putEntity(env, context, 'shopsettings', 'agentphone', {
      provider: 'agentphone.ai', agentId, webhookUrl, contextLimit, timeout,
      status: result.status || 'active', configuredAt: new Date().toISOString(),
    }),
  ]);
  return json({ configured: true, status: result.status || 'active', agentId, webhookUrl, contextLimit, timeout });
}

async function handleAgentPhoneWebhook(request, env, shopId) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const payload = await request.text();
  const signature = request.headers.get('X-Webhook-Signature') || '';
  const timestamp = request.headers.get('X-Webhook-Timestamp') || '';
  if (!shopId || !signature || !/^\d+$/.test(timestamp)) throw new HttpError(400, 'Missing webhook authentication');
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) throw new HttpError(401, 'Expired webhook signature');
  const secret = await getIntegrationSecret(env, shopId, 'agentphone-webhook-secret');
  const expected = `sha256=${await hmacHex(secret, `${timestamp}.${payload}`)}`;
  if (!secret || !constantTimeEqual(signature, expected)) throw new HttpError(401, 'Invalid webhook signature');
  const account = await env.DB.prepare('SELECT suspended FROM accounts WHERE shop_id = ?').bind(shopId).first();
  if (account && Number(account.suspended) === 1) throw new HttpError(403, 'Shop account is suspended');
  const body = parseJson(payload);
  if (body.event === 'agent.call_ended') return json({ received: true });
  if (body.event !== 'agent.message' || !['voice', 'sms', 'mms', 'imessage'].includes(String(body.channel))) return json({ received: true });
  const transcript = String(body.data?.transcript || body.data?.message || '').trim().slice(0, 4000);
  if (!transcript) return json({ text: 'How can I help you today?' });
  return json(await aiAnswer(env, shopId, transcript, body.recentHistory || []));
}

async function handleFiles(request, env, context, segments) {
  const action = segments[1];
  if (action === 'presign-upload' && request.method === 'POST') {
    const body = await requestJson(request);
    const kind = String(body.kind || 'file').replace(/[^a-z0-9-]/gi, '').slice(0, 40) || 'file';
    const contentType = String(body.contentType || 'application/octet-stream').toLowerCase().split(';')[0].trim();
    const contentLength = Number(body.contentLength || 0);
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > 15 * 1024 * 1024) throw new HttpError(400, 'File size must be between 1 byte and 15 MB');
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(contentType)) throw new HttpError(400, 'Unsupported file type');
    const key = `shops/${context.shopId}/${kind}/${crypto.randomUUID()}`;
    const uploadUrl = new URL('/api/files/upload', request.url);
    uploadUrl.searchParams.set('key', key);
    return json({ uploadUrl: uploadUrl.href, key, expiresIn: 300 });
  }
  const key = new URL(request.url).searchParams.get('key') || (action === 'object' ? '' : decodeURIComponent(segments.slice(1).join('/')));
  if (!key || !key.startsWith(`shops/${context.shopId}/`)) throw new HttpError(403, 'File key is outside this shop');
  if (action === 'upload' && request.method === 'PUT') {
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > 15 * 1024 * 1024) throw new HttpError(413, 'File exceeds 15 MB');
    await env.FILES.put(key, request.body, {
      httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' },
      customMetadata: { shopId: context.shopId, uploadedBy: context.userId },
    });
    return new Response(null, { status: 204 });
  }
  if (action === 'presign-download' && request.method === 'GET') {
    const downloadUrl = new URL('/api/files/object', request.url);
    downloadUrl.searchParams.set('key', key);
    return json({ url: downloadUrl.href, key, expiresIn: 300 });
  }
  if ((action === 'object' || action !== 'upload') && request.method === 'GET') {
    const object = await env.FILES.get(key);
    if (!object) throw new HttpError(404, 'File not found');
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(object.body, { headers });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function handleCheckout(request, env, context) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  requireRole(context, ['admin', 'office', 'service_writer']);
  const body = await requestJson(request);
  const invoiceNumber = String(body.invoiceNumber || '');
  if (!invoiceNumber) throw new HttpError(400, 'invoiceNumber is required');
  const invoice = await getEntity(env, context.shopId, 'invoices', invoiceNumber);
  if (!invoice) throw new HttpError(404, 'Invoice not found');
  const payments = (await listEntities(env, context.shopId, 'payments')).filter(payment => payment.invoiceNumber === invoiceNumber);
  const balance = openInvoiceBalance(invoice.amount, payments);
  if (balance <= 0) throw new HttpError(409, 'Invoice has no open balance');
  const origin = request.headers.get('Origin');
  const validRedirect = value => {
    try {
      const url = new URL(String(value || ''));
      return origin && url.origin === origin && ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  };
  const successUrl = validRedirect(body.successUrl);
  const cancelUrl = validRedirect(body.cancelUrl);
  if (!successUrl || !cancelUrl) throw new HttpError(400, 'Checkout redirects must match the requesting site');
  const stripeKey = await getIntegrationSecret(env, context.shopId, 'stripe-secret-key');
  if (!stripeKey) throw new HttpError(409, 'This shop has not connected a Stripe account yet');
  const params = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(Math.round(balance * 100)),
    'line_items[0][price_data][product_data][name]': `Invoice ${invoiceNumber}`,
    'line_items[0][quantity]': '1',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'metadata[shopId]': context.shopId,
    'metadata[invoiceNumber]': invoiceNumber,
  });
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${stripeKey}:`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, 'Stripe rejected the checkout session request');
  return json({ url: result.url, sessionId: result.id });
}

async function handleStripeWebhook(request, env, shopId) {
  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  const payload = await request.text();
  const signature = request.headers.get('Stripe-Signature') || '';
  const fields = signature.split(',').map(item => item.trim().split('=', 2));
  const timestamp = fields.find(([key]) => key === 't')?.[1];
  const signatures = fields.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!shopId || !timestamp || !/^\d+$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    throw new HttpError(400, 'Invalid Stripe signature');
  }
  const secret = await getIntegrationSecret(env, shopId, 'stripe-webhook-secret');
  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  if (!secret || !signatures.some(value => constantTimeEqual(value, expected))) throw new HttpError(400, 'Invalid Stripe signature');
  const event = parseJson(payload);
  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object || {};
    const invoiceNumber = session.metadata?.invoiceNumber;
    if (invoiceNumber && session.metadata?.shopId === shopId && session.payment_status === 'paid' && session.currency === 'usd') {
      const invoice = await getEntity(env, shopId, 'invoices', invoiceNumber);
      if (!invoice) throw new HttpError(400, 'Invoice not found');
      const id = String(session.id);
      if (await getEntity(env, shopId, 'payments', id)) return json({ received: true, duplicate: true });
      const context = { shopId, userId: 'stripe-webhook' };
      const payments = (await listEntities(env, shopId, 'payments')).filter(payment => payment.invoiceNumber === invoiceNumber);
      const amount = Number(session.amount_total || 0) / 100;
      if (amount <= 0 || amount > openInvoiceBalance(invoice.amount, payments)) throw new HttpError(400, 'Payment amount exceeds the invoice balance');
      await putEntity(env, context, 'payments', id, {
        invoiceNumber, amount, method: 'processor', processor: 'stripe',
        processorTransactionId: id, status: 'completed', receivedAt: new Date().toISOString(),
      });
    }
  }
  return json({ received: true });
}

async function handleEntitlement(request, env, context) {
  if (request.method !== 'GET') throw new HttpError(405, 'Method not allowed');
  if (context.role === 'super_admin') return json({ active: true, status: 'platform', expiresAt: null });
  const account = await env.DB.prepare(
    'SELECT suspended, subscription_status, subscription_expires_at FROM accounts WHERE shop_id = ?',
  ).bind(context.shopId).first();
  if (!account) return json({ active: false, status: 'missing', expiresAt: null }, 403);
  const expiresAt = account.subscription_expires_at || null;
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
  const status = Number(account.suspended) === 1 ? 'suspended' : expired ? 'expired' : String(account.subscription_status || 'missing');
  const active = Number(account.suspended) !== 1 && ['active', 'trialing'].includes(status) && !expired;
  return json({ active, status, expiresAt }, active ? 200 : 403);
}

async function handleAdmin(request, env, context, segments) {
  requireRole(context, ['super_admin']);
  if (segments.length === 2 && request.method === 'GET') {
    const accounts = await env.DB.prepare('SELECT * FROM accounts ORDER BY created_at DESC').all();
    const users = await env.DB.prepare('SELECT email, name, shop_id, role, enabled FROM users ORDER BY email').all();
    return json(accounts.results.map(account => ({
      id: account.shop_id, shopId: account.shop_id, shopName: account.shop_name,
      ownerEmail: account.owner_email, ownerName: account.owner_name,
      creditBalance: account.credit_balance, subscriptionStatus: account.subscription_status,
      subscriptionExpiresAt: account.subscription_expires_at, suspended: Boolean(account.suspended),
      createdAt: account.created_at, updatedAt: account.updated_at,
      users: users.results.filter(user => user.shop_id === account.shop_id).map(user => ({
        email: user.email, name: user.name, shopId: user.shop_id, role: user.role,
        enabled: Boolean(user.enabled), status: user.enabled ? 'ACTIVE' : 'DISABLED',
      })),
    })));
  }
  if (segments.length === 2 && request.method === 'POST') {
    const body = await requestJson(request);
    const email = String(body.email || '').trim().toLowerCase();
    const ownerName = String(body.ownerName || '').trim();
    const shopName = String(body.shopName || '').trim();
    const shopId = String(body.shopId || '').trim().toLowerCase();
    if (!email || !ownerName || !shopName || !validShopId(shopId)) throw new HttpError(400, 'Owner name, email, shop name, and a valid shop ID are required');
    const existing = await env.DB.prepare(
      'SELECT shop_id FROM accounts WHERE shop_id = ? UNION ALL SELECT shop_id FROM users WHERE email = ? COLLATE NOCASE LIMIT 1',
    ).bind(shopId, email).first();
    if (existing) throw new HttpError(409, 'An account already uses this shop ID or owner email');
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO accounts (shop_id, shop_name, owner_email, owner_name, created_at, updated_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(shopId, shopName, email, ownerName, now, now, context.userId),
      env.DB.prepare(`
        INSERT INTO users (email, shop_id, role, name, created_at, updated_at) VALUES (?, ?, 'admin', ?, ?, ?)
      `).bind(email, shopId, ownerName, now, now),
      env.DB.prepare(`
        INSERT INTO entities (shop_id, entity_type, entity_id, data_json, created_by, created_at, updated_at)
        VALUES (?, 'employees', ?, ?, ?, ?, ?)
      `).bind(shopId, `owner-${shopId}`, JSON.stringify({
        id: `owner-${shopId}`, shopId, name: ownerName, email, role: 'admin', title: 'Owner',
        department: 'Administration', active: true, createdAt: now, updatedAt: now,
      }), context.userId, now, now),
    ]);
    return json({ id: shopId, shopId, shopName, ownerEmail: email, ownerName, creditBalance: 0, subscriptionStatus: 'active', createdAt: now, updatedAt: now }, 201);
  }
  const target = decodeURIComponent(segments[2] || '');
  const action = segments[3];
  if (request.method === 'POST' && action === 'integrations' && segments[4] === 'stripe') {
    if (!validShopId(target)) throw new HttpError(400, 'A valid shop ID is required');
    const body = await requestJson(request);
    const secretKey = String(body.secretKey || '').trim();
    const webhookSecret = String(body.webhookSecret || '').trim();
    if (!/^sk_(test|live)_/.test(secretKey) || !/^whsec_/.test(webhookSecret)) {
      throw new HttpError(400, 'Valid Stripe secret and webhook signing keys are required');
    }
    await Promise.all([
      saveIntegrationSecret(env, target, 'stripe-secret-key', secretKey),
      saveIntegrationSecret(env, target, 'stripe-webhook-secret', webhookSecret),
    ]);
    return json({ configured: true, shopId: target, provider: 'stripe' });
  }
  if (request.method === 'POST' && ['reset-password', 'set-password'].includes(action)) {
    throw new HttpError(501, 'Passwords are managed by the Cloudflare Access identity provider');
  }
  if (request.method === 'POST' && action === 'credits') {
    const body = await requestJson(request);
    const amount = Math.round(Number(body.amount) * 100) / 100;
    const reason = String(body.reason || '').trim();
    if (!validShopId(target) || !Number.isFinite(amount) || amount <= 0 || !reason) throw new HttpError(400, 'A valid shop ID, positive credit amount, and reason are required');
    const result = await env.DB.prepare(
      'UPDATE accounts SET credit_balance = credit_balance + ?, updated_at = ? WHERE shop_id = ?',
    ).bind(amount, new Date().toISOString(), target).run();
    if (!result.meta.changes) throw new HttpError(404, 'Customer account not found');
    return json({ id: crypto.randomUUID(), shopId: target, amount, reason, createdAt: new Date().toISOString() }, 201);
  }
  if (request.method === 'POST' && action === 'status') {
    const body = await requestJson(request);
    if (!validShopId(target) || typeof body.suspended !== 'boolean') throw new HttpError(400, 'A valid shop ID and suspended status are required');
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      'UPDATE accounts SET suspended = ?, updated_at = ? WHERE shop_id = ?',
    ).bind(body.suspended ? 1 : 0, now, target).run();
    if (!result.meta.changes) throw new HttpError(404, 'Customer account not found');
    await env.DB.prepare('UPDATE users SET enabled = ?, updated_at = ? WHERE shop_id = ?').bind(body.suspended ? 0 : 1, now, target).run();
    return json({ shopId: target, suspended: body.suspended });
  }
  throw new HttpError(405, 'Method not allowed');
}

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const segments = path.split('/').filter(Boolean);
  if (request.method === 'OPTIONS') {
    const origin = allowedOrigin(request, env);
    if (!origin) return new Response(null, { status: 204 });
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Headers': 'Content-Type, If-Match',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        Vary: 'Origin',
      },
    });
  }
  if (path === '/healthz') return json({ ok: true, service: 'mechpro-cloudflare-api' });
  if (segments[0] === 'payments' && segments[1] === 'webhook') return handleStripeWebhook(request, env, decodeURIComponent(segments[2] || ''));
  if (segments[0] === 'agentphone' && segments[1] === 'webhook') return handleAgentPhoneWebhook(request, env, decodeURIComponent(segments[2] || ''));
  const context = await resolveContext(request, env);
  await requireActiveAccount(context, env);
  if (path === '/auth/session') return handleAuthSession(context);
  if (segments[0] === 'entities') return handleEntities(request, env, context, segments);
  if (segments[0] === 'vehicles' && segments[1] === 'decode') return handleVin(request, env, context, segments[2]);
  if (segments[0] === 'diagnostics') return handleDiagnostics(request, env, context, segments);
  if (path === '/onboarding/start') return handleOnboarding(request, env, context);
  if (path === '/payroll/sync') return handlePayroll(request, env, context);
  if (path === '/tax-report') return handleTaxReport(request, env, context);
  if (path === '/ai/assistant') return handleAssistant(request, env, context);
  if (path === '/agentphone/configure') return handleAgentPhoneConfigure(request, env, context);
  if (segments[0] === 'files') return handleFiles(request, env, context, segments);
  if (path === '/payments/checkout-session') return handleCheckout(request, env, context);
  if (path === '/subscription/entitlement') return handleEntitlement(request, env, context);
  if (segments[0] === 'admin' && segments[1] === 'accounts') return handleAdmin(request, env, context, segments);
  throw new HttpError(404, 'Not found');
}

function isApiRequest(request) {
  const path = new URL(request.url).pathname;
  return path === '/api' || path.startsWith('/api/');
}

async function proxyPagesRequest(request, env) {
  if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, 'Method not allowed');
  const incoming = new URL(request.url);
  const pagesOrigin = String(env.PAGES_ORIGIN || 'https://mechpro-dispatch.pages.dev').replace(/\/$/, '');
  const target = new URL(`${incoming.pathname}${incoming.search}`, pagesOrigin);
  const headers = new Headers(request.headers);
  headers.set('Host', target.host);
  const response = await fetch(new Request(target, {
    method: request.method,
    headers,
    redirect: 'manual',
  }));
  const nextHeaders = new Headers(response.headers);
  nextHeaders.delete('Content-Security-Policy-Report-Only');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders,
  });
}

export default {
  async fetch(request, env) {
    try {
      if (!isApiRequest(request)) return proxyPagesRequest(request, env);
      return withCors(await route(request, env), request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      console.error(JSON.stringify({
        message: 'request failed',
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        error: error instanceof Error ? error.message : String(error),
      }));
      return withCors(json({ message: status === 500 ? 'Internal error' : error.message }, status), request, env);
    }
  },
};
