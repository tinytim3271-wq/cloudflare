import {
  QUICKBOOKS_SECRET_NAME,
  QUICKBOOKS_SCOPES,
  buildQboIdempotencyKey,
  mapCustomerToQbo,
  mapInvoiceToQbo,
  mapPaymentToQbo,
  quickbooksConnectionStatus,
} from '../../../src/modules/quickbooks.js';
import { HttpError, json, requestJson } from '../http.mjs';

const ADMIN_ROLES = ['owner', 'admin', 'super_admin'];
const USE_ROLES = ['owner', 'admin', 'service_writer', 'office'];
const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const API_BASE = 'https://quickbooks.api.intuit.com/v3/company';
const SANDBOX_API_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company';

function appCredentials(env) {
  const clientId = String(env.QUICKBOOKS_CLIENT_ID || '').trim();
  const clientSecret = String(env.QUICKBOOKS_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new HttpError(503, 'QuickBooks Online app credentials are not configured on the Worker');
  }
  return { clientId, clientSecret };
}

function apiBase(env, record) {
  if (record?.environment === 'sandbox' || env.QUICKBOOKS_SANDBOX === '1') return SANDBOX_API_BASE;
  return env.QUICKBOOKS_API_BASE || API_BASE;
}

async function readRecord(getSecret, shopId) {
  const raw = await getSecret(shopId, QUICKBOOKS_SECRET_NAME);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function exchangeToken(env, form, fetcher = fetch) {
  const { clientId, clientSecret } = appCredentials(env);
  const basic = btoa(`${clientId}:${clientSecret}`);
  const response = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new HttpError(502, body.error_description || body.error || 'QuickBooks token exchange failed');
  }
  return body;
}

async function ensureAccessToken(env, record, { getSecret, saveSecret, shopId, fetcher = fetch }) {
  if (!quickbooksConnectionStatus(record).connected) {
    throw new HttpError(409, 'QuickBooks Online is not connected');
  }
  const expiresAt = Date.parse(record.tokenExpiresAt || 0);
  if (record.accessToken && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    return record;
  }
  if (!record.refreshToken) throw new HttpError(409, 'QuickBooks Online needs to be reconnected');
  const token = await exchangeToken(env, new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: record.refreshToken,
  }), fetcher);
  const next = {
    ...record,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || record.refreshToken,
    tokenExpiresAt: new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString(),
    refreshExpiresAt: token.x_refresh_token_expires_in
      ? new Date(Date.now() + Number(token.x_refresh_token_expires_in) * 1000).toISOString()
      : record.refreshExpiresAt || null,
  };
  await saveSecret(env, shopId, QUICKBOOKS_SECRET_NAME, JSON.stringify(next));
  return next;
}

async function qboRequest(env, record, path, { method = 'GET', body, fetcher = fetch } = {}) {
  const response = await fetcher(`${apiBase(env, record)}/${encodeURIComponent(record.realmId)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${record.accessToken}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.Fault?.Error?.[0]?.Message || payload.message || `QuickBooks request failed (${response.status})`;
    throw new HttpError(502, message);
  }
  return payload;
}

async function findSync(env, shopId, idempotencyKey) {
  return env.DB.prepare(
    'SELECT remote_id, status, payload_hash FROM integration_sync_log WHERE shop_id = ? AND provider = ? AND idempotency_key = ?',
  ).bind(shopId, 'quickbooks', idempotencyKey).first();
}

async function writeSync(env, {
  shopId, entityType, localId, remoteId, idempotencyKey, payloadHash, status, error = null,
}) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO integration_sync_log
      (shop_id, provider, entity_type, local_id, remote_id, idempotency_key, payload_hash, status, last_error, synced_at)
    VALUES (?, 'quickbooks', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(shop_id, provider, idempotency_key) DO UPDATE SET
      remote_id = excluded.remote_id,
      payload_hash = excluded.payload_hash,
      status = excluded.status,
      last_error = excluded.last_error,
      synced_at = excluded.synced_at
  `).bind(shopId, entityType, localId, remoteId || '', idempotencyKey, payloadHash || '', status, error, now).run();
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function createQuickbooksHandlers({
  saveSecret,
  getSecret,
  deleteSecret,
  requireRole,
  recordAudit,
}) {
  return async function handleQuickbooks(request, env, context, segments) {
    const action = segments[2] || '';
    const fetcher = env.fetch || fetch;

    if (request.method === 'GET' && !action) {
      requireRole(context, USE_ROLES);
      return json(quickbooksConnectionStatus(await readRecord(getSecret, context.shopId)));
    }

    if (action === 'connect' && request.method === 'POST') {
      requireRole(context, ADMIN_ROLES);
      const { clientId } = appCredentials(env);
      const body = await requestJson(request).catch(() => ({}));
      const redirectUri = String(body.redirectUri || env.QUICKBOOKS_REDIRECT_URI || '').trim();
      if (!redirectUri) throw new HttpError(400, 'redirectUri is required');
      const state = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await env.DB.prepare(`
        INSERT INTO oauth_states (state, shop_id, provider, created_at, expires_at, meta_json)
        VALUES (?, ?, 'quickbooks', ?, ?, ?)
      `).bind(state, context.shopId, new Date().toISOString(), expiresAt, JSON.stringify({ redirectUri, userId: context.userId })).run();
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', QUICKBOOKS_SCOPES);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      return json({ authorizeUrl: url.toString(), state });
    }

    if (action === 'callback' && request.method === 'POST') {
      // Authenticated shop callback after Intuit redirects to the app with ?code&realmId&state
      requireRole(context, ADMIN_ROLES);
      const body = await requestJson(request);
      const code = String(body.code || '').trim();
      const realmId = String(body.realmId || '').trim();
      const state = String(body.state || '').trim();
      if (!code || !realmId || !state) throw new HttpError(400, 'code, realmId, and state are required');
      const row = await env.DB.prepare(
        'SELECT shop_id, expires_at, meta_json FROM oauth_states WHERE state = ? AND provider = ?',
      ).bind(state, 'quickbooks').first();
      if (!row || row.shop_id !== context.shopId) throw new HttpError(400, 'Invalid OAuth state');
      if (Date.parse(row.expires_at) < Date.now()) throw new HttpError(400, 'OAuth state expired');
      const meta = JSON.parse(row.meta_json || '{}');
      const token = await exchangeToken(env, new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: meta.redirectUri,
      }), fetcher);
      const record = {
        realmId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt: new Date(Date.now() + (Number(token.expires_in) || 3600) * 1000).toISOString(),
        refreshExpiresAt: token.x_refresh_token_expires_in
          ? new Date(Date.now() + Number(token.x_refresh_token_expires_in) * 1000).toISOString()
          : null,
        connectedAt: new Date().toISOString(),
        connectedBy: context.userId,
        environment: env.QUICKBOOKS_SANDBOX === '1' ? 'sandbox' : 'production',
      };
      await saveSecret(env, context.shopId, QUICKBOOKS_SECRET_NAME, JSON.stringify(record));
      await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();
      await recordAudit?.(env, context, { kind: 'integrations.quickbooks.connect', realmId });
      return json(quickbooksConnectionStatus(record), 201);
    }

    if (request.method === 'DELETE' && !action) {
      requireRole(context, ADMIN_ROLES);
      await deleteSecret(env, context.shopId, QUICKBOOKS_SECRET_NAME);
      await recordAudit?.(env, context, { kind: 'integrations.quickbooks.disconnect' });
      return json({ connected: false, status: 'not_connected' });
    }

    let record = await readRecord(getSecret, context.shopId);
    if (!quickbooksConnectionStatus(record).connected) {
      throw new HttpError(409, 'QuickBooks Online is not connected');
    }
    requireRole(context, USE_ROLES);
    record = await ensureAccessToken(env, record, {
      getSecret, saveSecret, shopId: context.shopId, fetcher,
    });

    if (action === 'sync' && request.method === 'POST') {
      const body = await requestJson(request);
      const entityType = String(body.entityType || '').toLowerCase();
      const localId = String(body.localId || body.id || '').trim();
      if (!['customer', 'invoice', 'payment'].includes(entityType)) {
        throw new HttpError(400, 'entityType must be customer, invoice, or payment');
      }
      if (!localId) throw new HttpError(400, 'localId is required');
      const idempotencyKey = buildQboIdempotencyKey(context.shopId, entityType, localId, body.action || 'upsert');
      let payload;
      if (entityType === 'customer') payload = mapCustomerToQbo(body.customer || body.data || {});
      else if (entityType === 'invoice') {
        payload = mapInvoiceToQbo(body.invoice || body.data || {}, body.customerRef || body.qboCustomerId);
      } else {
        payload = mapPaymentToQbo(
          body.payment || body.data || {},
          body.customerRef || body.qboCustomerId,
          body.invoiceRef || body.qboInvoiceId,
        );
      }
      const payloadHash = await sha256Hex(JSON.stringify(payload));
      const existing = await findSync(env, context.shopId, idempotencyKey);
      if (existing?.status === 'synced' && existing.payload_hash === payloadHash && existing.remote_id) {
        return json({
          connected: true,
          idempotent: true,
          entityType,
          localId,
          remoteId: existing.remote_id,
        });
      }

      try {
        const resource = entityType === 'customer' ? 'customer' : entityType === 'invoice' ? 'invoice' : 'payment';
        const result = await qboRequest(env, record, `/${resource}?minorversion=75`, {
          method: 'POST',
          body: payload,
          fetcher,
        });
        const entity = result.Customer || result.Invoice || result.Payment || result;
        const remoteId = String(entity.Id || '');
        await writeSync(env, {
          shopId: context.shopId,
          entityType,
          localId,
          remoteId,
          idempotencyKey,
          payloadHash,
          status: 'synced',
        });
        await recordAudit?.(env, context, {
          kind: 'integrations.quickbooks.sync',
          entityType,
          localId,
          remoteId,
        });
        return json({
          connected: true,
          idempotent: false,
          entityType,
          localId,
          remoteId,
          syncToken: entity.SyncToken || null,
        });
      } catch (error) {
        await writeSync(env, {
          shopId: context.shopId,
          entityType,
          localId,
          remoteId: existing?.remote_id || '',
          idempotencyKey,
          payloadHash,
          status: 'error',
          error: error.message || 'sync failed',
        });
        throw error;
      }
    }

    throw new HttpError(404, 'Not found');
  };
}
