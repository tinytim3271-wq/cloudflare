import {
  LABOR_GUIDE_SECRET_NAME,
  createManualLaborEntry,
  isBookLaborProvider,
  laborGuideConnectionStatus,
  mapMotorLaborOperationToEstimateLine,
} from '../../../src/modules/labor-guide.js';
import { PARTSTECH_SECRET_NAME } from '../../../src/modules/partstech.js';
import { HttpError, json, requestJson } from '../http.mjs';
import { partstechFetch } from './partstech.mjs';
import { searchLaborWeb, webEstimateResponsePayload } from './labor-web-estimate.mjs';

const ADMIN_ROLES = ['owner', 'admin', 'super_admin'];
const USE_ROLES = ['owner', 'admin', 'service_writer', 'technician'];

async function readJsonSecret(getSecret, shopId, name) {
  const raw = await getSecret(shopId, name);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function createLaborGuideHandlers({
  saveSecret,
  getSecret,
  deleteSecret,
  requireRole,
  recordAudit,
}) {
  return async function handleLaborGuide(request, env, context, segments) {
    const action = segments[2] || '';

    if (request.method === 'GET' && !action) {
      requireRole(context, USE_ROLES);
      const record = await readJsonSecret(getSecret, context.shopId, LABOR_GUIDE_SECRET_NAME);
      return json(laborGuideConnectionStatus(record));
    }

    if (request.method === 'POST' && !action) {
      requireRole(context, ADMIN_ROLES);
      const body = await requestJson(request);
      const provider = String(body.provider || 'manual').toLowerCase();
      if (provider === 'manual') {
        await deleteSecret(env, context.shopId, LABOR_GUIDE_SECRET_NAME);
        return json(laborGuideConnectionStatus({ provider: 'manual' }), 201);
      }
      if (!isBookLaborProvider(provider)) {
        throw new HttpError(400, 'Unsupported labor guide provider');
      }

      const record = {
        provider,
        connectedAt: new Date().toISOString(),
        connectedBy: context.userId,
        defaultLaborRate: Number(body.defaultLaborRate) || null,
      };

      if (provider === 'motor') {
        const viaPartstech = body.viaPartstech !== false;
        record.viaPartstech = viaPartstech;
        if (!viaPartstech) {
          record.userId = String(body.userId || '').trim();
          record.userKey = String(body.userKey || '').trim();
          record.partnerId = String(body.partnerId || '').trim();
          record.partnerKey = String(body.partnerKey || '').trim();
        }
        if (viaPartstech) {
          const pt = await readJsonSecret(getSecret, context.shopId, PARTSTECH_SECRET_NAME);
          if (!pt?.userId || !pt?.userKey || !pt?.partnerId || !pt?.partnerKey) {
            throw new HttpError(409, 'Connect PartsTech before enabling MOTOR via PartsTech');
          }
        } else if (!laborGuideConnectionStatus(record).connected) {
          throw new HttpError(400, 'MOTOR credentials or viaPartstech are required');
        }
      } else {
        // ALLDATA / ShopKey — store subscription credentials when provided.
        record.apiKey = String(body.apiKey || '').trim() || null;
        record.username = String(body.username || '').trim() || null;
        record.password = String(body.password || '').trim() || null;
        record.subscriptionId = String(body.subscriptionId || '').trim() || null;
        if (!laborGuideConnectionStatus(record).connected) {
          throw new HttpError(400, `${provider} credentials are required (apiKey or username/password or subscriptionId)`);
        }
      }

      await saveSecret(env, context.shopId, LABOR_GUIDE_SECRET_NAME, JSON.stringify(record));
      await recordAudit?.(env, context, { kind: 'integrations.labor_guide.connect', provider });
      return json(laborGuideConnectionStatus(record), 201);
    }

    if (request.method === 'DELETE' && !action) {
      requireRole(context, ADMIN_ROLES);
      await deleteSecret(env, context.shopId, LABOR_GUIDE_SECRET_NAME);
      await recordAudit?.(env, context, { kind: 'integrations.labor_guide.disconnect' });
      return json({ connected: false, provider: 'manual', status: 'not_connected', webFallbackEligible: true });
    }

    requireRole(context, USE_ROLES);

    if (action === 'manual' && request.method === 'POST') {
      const body = await requestJson(request);
      return json({ line: createManualLaborEntry(body) });
    }

    if (action === 'search' && request.method === 'POST') {
      const record = await readJsonSecret(getSecret, context.shopId, LABOR_GUIDE_SECRET_NAME);
      const status = laborGuideConnectionStatus(record);
      const body = await requestJson(request);
      const laborRate = Math.max(0, Number(body.laborRate ?? record?.defaultLaborRate) || 0);
      const keyword = String(body.keyword || body.operation || '').trim();
      const vin = String(body.vin || '').trim();

      // Book provider path (MOTOR via PartsTech today; ALLDATA/ShopKey fail closed until adapters ship).
      if (status.connected && status.provider === 'motor') {
        let credentials = record;
        if (record.viaPartstech) {
          credentials = await readJsonSecret(getSecret, context.shopId, PARTSTECH_SECRET_NAME);
          if (!credentials) throw new HttpError(409, 'PartsTech is not connected');
        }
        if (!vin && !body.vehicleParams) throw new HttpError(400, 'vin or vehicleParams is required');
        const fetcher = env.fetch || fetch;
        const baseUrl = env.PARTSTECH_API_BASE || 'https://api.partstech.com';
        const searchParams = vin ? { vin } : { vehicleParams: body.vehicleParams };
        const laborParams = keyword ? { keyword } : body.laborParams || undefined;
        const payload = await partstechFetch(credentials, '/taxonomy/labor', {
          method: 'POST',
          body: laborParams ? { searchParams, laborParams } : { searchParams },
          fetcher,
          baseUrl,
        });
        const operations = payload.operations || payload.laborOperations || payload.results || [];
        const groups = payload.groups || payload.laborGroups || [];
        const lines = (Array.isArray(operations) ? operations : []).map((operation, index) => (
          mapMotorLaborOperationToEstimateLine(operation, { laborRate, provider: 'motor' }, index)
        ));
        await recordAudit?.(env, context, { kind: 'integrations.labor_guide.search', provider: 'motor', count: lines.length });
        return json({
          connected: true,
          provider: 'motor',
          groups: Array.isArray(groups) ? groups : [],
          operations: Array.isArray(operations) ? operations : [],
          lines,
        });
      }

      if (status.connected && (status.provider === 'alldata' || status.provider === 'shopkey')) {
        // Credentials may be stored, but live adapters are not wired yet — fail closed (no fake book times).
        throw new HttpError(501, `${status.provider} lookup is not enabled yet; disconnect it to use web estimates, or use manual entry`);
      }

      // No book provider connected → automatic web fallback (clearly labeled, never as book time).
      const estimate = await searchLaborWeb(env, {
        year: body.year,
        make: body.make,
        model: body.model,
        engine: body.engine,
        operation: body.operation || keyword,
        keyword,
        vin,
      }, { fetcher: env.fetch || fetch });
      await recordAudit?.(env, context, {
        kind: 'integrations.labor_guide.web_fallback',
        found: Boolean(estimate.found),
        sourceCount: estimate.sourceCount || 0,
      });
      return json(webEstimateResponsePayload(estimate, { laborRate }));
    }

    throw new HttpError(404, 'Not found');
  };
}
