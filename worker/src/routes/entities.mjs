import {
  ENTITY_TYPES,
  canReadEntity,
  canWriteEntity,
  normalizeEntityPayload,
  normalizeEntityType,
  redactEmployee,
} from '../domain.mjs';
import { HttpError, json, requestJson } from '../http.mjs';

const SHOP_ROLES = new Set(['admin', 'technician', 'office', 'service_writer']);

function entityRecord(row) {
  if (!row) return null;
  try {
    return JSON.parse(row.data_json);
  } catch {
    return null;
  }
}

export async function getEntity(env, shopId, type, id) {
  return entityRecord(await env.DB.prepare(
    'SELECT data_json FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
  ).bind(shopId, type, id).first());
}

export async function listEntities(env, shopId, type, { limit = 0, cursor = '' } = {}) {
  const boundedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(200, Math.floor(Number(limit)))
    : 0;
  const nextCursor = String(cursor || '').trim();
  const filters = ['shop_id = ?', 'entity_type = ?'];
  const bindValues = [shopId, type];
  if (nextCursor) {
    filters.push('updated_at > ?');
    bindValues.push(nextCursor);
  }
  let sql = `SELECT data_json, updated_at FROM entities WHERE ${filters.join(' AND ')} ORDER BY updated_at`;
  if (boundedLimit) {
    sql += ' LIMIT ?';
    bindValues.push(boundedLimit);
  }
  const result = await env.DB.prepare(sql).bind(...bindValues).all();
  const rows = result.results || [];
  const records = rows.map(entityRecord).filter(Boolean);
  if (!boundedLimit) return records;
  return {
    records,
    nextCursor: rows.length === boundedLimit ? String(rows.at(-1)?.updated_at || '') : null,
  };
}

export async function putEntity(env, context, type, id, body, expectedUpdatedAt = null, createdBy = context.userId) {
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

function listParams(request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(200, Math.floor(requestedLimit))
    : 0;
  return {
    limit,
    cursor: String(url.searchParams.get('cursor') || '').trim(),
    conversationId: String(url.searchParams.get('conversationId') || '').trim(),
  };
}

async function listConversationIdsForMember(env, shopId, email, { limit = 0, cursor = '' } = {}) {
  const boundedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(200, Math.floor(Number(limit)))
    : 0;
  const bindValues = [shopId, email.toLowerCase()];
  let sql = `
    SELECT e.entity_id, e.updated_at, e.data_json
    FROM entities e, json_each(e.data_json, '$.memberEmails') member
    WHERE e.shop_id = ? AND e.entity_type = 'conversations' AND lower(member.value) = ?
  `;
  if (cursor) {
    sql += ' AND e.updated_at > ?';
    bindValues.push(cursor);
  }
  sql += ' ORDER BY e.updated_at';
  if (boundedLimit) {
    sql += ' LIMIT ?';
    bindValues.push(boundedLimit);
  }
  const result = await env.DB.prepare(sql).bind(...bindValues).all();
  const rows = result.results || [];
  const records = rows.map(entityRecord).filter(Boolean);
  return {
    records,
    ids: records.map(record => String(record.id || '')).filter(Boolean),
    nextCursor: boundedLimit && rows.length === boundedLimit ? String(rows.at(-1)?.updated_at || '') : null,
  };
}

async function listChatMessagesForConversations(env, shopId, conversationIds, { limit = 0, cursor = '' } = {}) {
  if (!conversationIds.length) return { records: [], nextCursor: null };
  const boundedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.min(200, Math.floor(Number(limit)))
    : 0;
  const placeholders = conversationIds.map(() => '?').join(', ');
  const bindValues = [shopId, ...conversationIds];
  let sql = `
    SELECT data_json, updated_at
    FROM entities
    WHERE shop_id = ? AND entity_type = 'chatmessages'
      AND json_extract(data_json, '$.conversationId') IN (${placeholders})
  `;
  if (cursor) {
    sql += ' AND updated_at > ?';
    bindValues.push(cursor);
  }
  sql += ' ORDER BY updated_at';
  if (boundedLimit) {
    sql += ' LIMIT ?';
    bindValues.push(boundedLimit);
  }
  const result = await env.DB.prepare(sql).bind(...bindValues).all();
  const rows = result.results || [];
  return {
    records: rows.map(entityRecord).filter(Boolean),
    nextCursor: boundedLimit && rows.length === boundedLimit ? String(rows.at(-1)?.updated_at || '') : null,
  };
}

async function hasLinkedCustomerEntity(env, shopId, type, customerName) {
  return Boolean(await env.DB.prepare(
    "SELECT 1 AS found FROM entities WHERE shop_id = ? AND entity_type = ? AND json_extract(data_json, '$.customer') = ? LIMIT 1",
  ).bind(shopId, type, customerName).first());
}

async function listPaymentsByInvoice(env, shopId, invoiceNumber) {
  const result = await env.DB.prepare(
    "SELECT data_json FROM entities WHERE shop_id = ? AND entity_type = 'payments' AND json_extract(data_json, '$.invoiceNumber') = ?",
  ).bind(shopId, invoiceNumber).all();
  return (result.results || []).map(entityRecord).filter(Boolean);
}

/**
 * Build D1 statements for deleting an entity.
 * Employee deletes must revoke Access users even when the row is not an invoice.
 */
export function buildEntityDeleteStatements(env, context, type, id, existing, relatedPayments = []) {
  const statements = [env.DB.prepare(
    'DELETE FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
  ).bind(context.shopId, type, id)];

  if (type === 'invoices') {
    for (const payment of relatedPayments.filter(record => record.invoiceNumber === (existing.number || existing.id))) {
      statements.push(env.DB.prepare(
        'DELETE FROM entities WHERE shop_id = ? AND entity_type = ? AND entity_id = ?',
      ).bind(context.shopId, 'payments', payment.id));
    }
  }

  if (type === 'employees' && existing.email) {
    statements.push(env.DB.prepare(
      'DELETE FROM users WHERE email = ? COLLATE NOCASE AND shop_id = ?',
    ).bind(existing.email, context.shopId));
  }

  return statements;
}

export async function handleEntities(request, env, context, segments) {
  const sourceType = String(segments[1] || '').toLowerCase();
  const type = normalizeEntityType(sourceType);
  const id = segments[2] ? decodeURIComponent(segments.slice(2).join('/')) : null;
  if (!ENTITY_TYPES.has(type)) throw new HttpError(404, `Unknown entity type: ${type}`);
  if (request.method === 'GET' && !canReadEntity(type, context.role)) throw new HttpError(403, `Role ${context.role} cannot read ${type}`);
  if (request.method !== 'GET' && !canWriteEntity(type, context.role)) throw new HttpError(403, `Role ${context.role} cannot modify ${type}`);

  if (request.method === 'GET' && !id) {
    const params = listParams(request);
    const paginated = params.limit > 0;
    let records;
    let nextCursor = null;
    if (type === 'conversations') {
      const result = await listConversationIdsForMember(env, context.shopId, context.email, params);
      records = result.records;
      nextCursor = result.nextCursor;
    } else {
      const result = await listEntities(env, context.shopId, type, params);
      records = paginated ? result.records : result;
      nextCursor = paginated ? result.nextCursor : null;
    }
    if (type === 'chatmessages') {
      const allowedResult = await listConversationIdsForMember(env, context.shopId, context.email);
      const allowedIds = new Set(allowedResult.ids);
      const conversationIds = params.conversationId ? [params.conversationId] : [...allowedIds];
      if (params.conversationId && !allowedIds.has(params.conversationId)) throw new HttpError(404, 'Conversation not found');
      const listed = await listChatMessagesForConversations(env, context.shopId, conversationIds, params);
      records = listed.records;
      nextCursor = listed.nextCursor;
    }
    if (type === 'employees') records = records.map(record => redactEmployee(record, context.role));
    return paginated ? json({ records, nextCursor }) : json(records);
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
      body = {
        ...body,
        body: String(body.body).trim().slice(0, 4000),
        memberEmails: members(conversation),
        senderEmail: context.email,
      };
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
      if (!memberEmails.includes(context.email) || memberEmails.length < 2) {
        throw new HttpError(400, 'Group requires the owner and at least one other member');
      }
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
      const links = await Promise.all(linkedTypes.map(linkedType => hasLinkedCustomerEntity(env, context.shopId, linkedType, existing.name)));
      if (links.some(Boolean)) {
        throw new HttpError(409, "Delete this customer's vehicles, work orders, and invoices first");
      }
    }
    const relatedPayments = type === 'invoices'
      ? await listPaymentsByInvoice(env, context.shopId, existing.number || existing.id)
      : [];
    await env.DB.batch(buildEntityDeleteStatements(env, context, type, id, existing, relatedPayments));
    return new Response(null, { status: 204 });
  }
  throw new HttpError(405, 'Method not allowed');
}
