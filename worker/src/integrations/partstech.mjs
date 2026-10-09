import { PARTSTECH_API_BASE, PARTSTECH_SECRET_NAME, mapPartstechQuoteItemToEstimateLine, mapPartstechOrderSummary, partstechConnectionStatus } from '../../../src/modules/partstech.js';
import { HttpError, json, requestJson } from '../http.mjs';

const ADMIN_ROLES = ['owner', 'admin', 'super_admin'];
const USE_ROLES = ['owner', 'admin', 'service_writer', 'technician'];

async function readCredentials(getSecret, shopId) {
  const raw = await getSecret(shopId, PARTSTECH_SECRET_NAME);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function accessToken(credentials, { fetcher = fetch, baseUrl = PARTSTECH_API_BASE } = {}) {
  if (!credentials?.userId || !credentials?.userKey || !credentials?.partnerId || !credentials?.partnerKey) {
    const error = new HttpError(409, 'PartsTech is not connected');
    error.code = 'not_connected';
    throw error;
  }
  const response = await fetcher(`${baseUrl}/oauth/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      accessType: 'user',
      credentials: {
        user: { id: credentials.userId, key: credentials.userKey },
        partner: { id: credentials.partnerId, key: credentials.partnerKey },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.accessToken) {
    throw new HttpError(502, body.message || body.error || 'PartsTech authentication failed');
  }
  return body.accessToken;
}

async function partstechFetch(credentials, path, { method = 'GET', body, fetcher = fetch, baseUrl = PARTSTECH_API_BASE } = {}) {
  const token = await accessToken(credentials, { fetcher, baseUrl });
  const response = await fetcher(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status === 401 ? 502 : 502, payload.message || payload.error || `PartsTech request failed (${response.status})`);
  }
  return payload;
}

export function createPartstechHandlers({
  saveSecret,
  getSecret,
  deleteSecret,
  requireRole,
  recordAudit,
}) {
  return async function handlePartstech(request, env, context, segments) {
    const action = segments[2] || '';
    if (request.method === 'GET' && !action) {
      requireRole(context, USE_ROLES);
      const credentials = await readCredentials(getSecret, context.shopId);
      return json(partstechConnectionStatus(credentials));
    }

    if (request.method === 'POST' && !action) {
      requireRole(context, ADMIN_ROLES);
      const body = await requestJson(request);
      const record = {
        partnerId: String(body.partnerId || '').trim(),
        partnerKey: String(body.partnerKey || '').trim(),
        userId: String(body.userId || '').trim(),
        userKey: String(body.userKey || '').trim(),
        storeId: String(body.storeId || '').trim() || null,
        connectedAt: new Date().toISOString(),
        connectedBy: context.userId,
      };
      if (!record.partnerId || !record.partnerKey || !record.userId || !record.userKey) {
        throw new HttpError(400, 'PartsTech partner and user credentials are required');
      }
      await saveSecret(env, context.shopId, PARTSTECH_SECRET_NAME, JSON.stringify(record));
      await recordAudit?.(env, context, { kind: 'integrations.partstech.connect', partnerId: record.partnerId, userId: record.userId });
      return json(partstechConnectionStatus(record), 201);
    }

    if (request.method === 'DELETE' && !action) {
      requireRole(context, ADMIN_ROLES);
      await deleteSecret(env, context.shopId, PARTSTECH_SECRET_NAME);
      await recordAudit?.(env, context, { kind: 'integrations.partstech.disconnect' });
      return json({ connected: false, status: 'not_connected' });
    }

    const credentials = await readCredentials(getSecret, context.shopId);
    if (!partstechConnectionStatus(credentials).connected) {
      throw new HttpError(409, 'PartsTech is not connected');
    }

    requireRole(context, USE_ROLES);
    const fetcher = env.fetch || fetch;
    const baseUrl = env.PARTSTECH_API_BASE || PARTSTECH_API_BASE;

    if (action === 'quote' && request.method === 'POST') {
      const body = await requestJson(request);
      const keyword = String(body.keyword || body.partNumber || '').trim();
      const vin = String(body.vin || '').trim();
      const storeId = String(body.storeId || credentials.storeId || '').trim();
      if (!keyword) throw new HttpError(400, 'keyword or partNumber is required');
      if (!storeId) throw new HttpError(400, 'storeId is required for PartsTech quotes');
      const searchParams = vin
        ? { vin, keyword }
        : /^\d[\w-]*$/.test(keyword) && !/\s/.test(keyword)
          ? { partNumber: keyword }
          : { keyword };
      const payload = await partstechFetch(credentials, '/catalog/quote', {
        method: 'POST',
        body: { storeId, searchParams },
        fetcher,
        baseUrl,
      });
      const rawItems = payload.parts || payload.items || payload.quotes || payload.results || [];
      const items = (Array.isArray(rawItems) ? rawItems : []).map((item, index) => (
        mapPartstechQuoteItemToEstimateLine({ ...item, storeId, quoteId: payload.quoteId || payload.id }, index)
      ));
      await recordAudit?.(env, context, { kind: 'integrations.partstech.quote', keyword, storeId, count: items.length });
      return json({ connected: true, storeId, items, rawCount: items.length });
    }

    if (action === 'order' && request.method === 'POST') {
      const body = await requestJson(request);
      const storeId = String(body.storeId || credentials.storeId || '').trim();
      const sessionId = String(body.sessionId || '').trim();
      if (!storeId) throw new HttpError(400, 'storeId is required');
      // Prefer punchout quote session purchase when sessionId is present; otherwise create a quote session.
      let payload;
      if (sessionId) {
        payload = await partstechFetch(credentials, '/punchout/quote/info', {
          method: 'POST',
          body: { sessionId },
          fetcher,
          baseUrl,
        });
      } else {
        const parts = Array.isArray(body.parts) ? body.parts : [];
        if (!parts.length) throw new HttpError(400, 'parts are required to place a PartsTech order');
        payload = await partstechFetch(credentials, '/punchout/quote/create', {
          method: 'POST',
          body: {
            storeId,
            callbackUrl: body.callbackUrl || undefined,
            searchParams: body.searchParams || undefined,
            parts,
          },
          fetcher,
          baseUrl,
        });
      }
      const summary = mapPartstechOrderSummary(payload);
      await recordAudit?.(env, context, { kind: 'integrations.partstech.order', storeId, orderId: summary.orderId || payload.sessionId });
      return json({ connected: true, order: summary, sessionId: payload.sessionId || null, redirectUrl: payload.redirectUrl || null });
    }

    throw new HttpError(404, 'Not found');
  };
}

export { accessToken, partstechFetch, readCredentials };
