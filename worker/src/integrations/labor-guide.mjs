import {
  LABOR_GUIDE_SECRET_NAME,
  createManualLaborEntry,
  laborGuideConnectionStatus,
  mapMotorLaborOperationToEstimateLine,
} from '../../../src/modules/labor-guide.js';
import { PARTSTECH_SECRET_NAME } from '../../../src/modules/partstech.js';
import { HttpError, json, requestJson } from '../http.mjs';
import { partstechFetch } from './partstech.mjs';

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
      if (provider !== 'motor') throw new HttpError(400, 'Unsupported labor guide provider');
      const viaPartstech = body.viaPartstech !== false;
      const record = {
        provider: 'motor',
        viaPartstech,
        connectedAt: new Date().toISOString(),
        connectedBy: context.userId,
        defaultLaborRate: Number(body.defaultLaborRate) || null,
      };
      if (!viaPartstech) {
        record.userId = String(body.userId || '').trim();
        record.userKey = String(body.userKey || '').trim();
        record.partnerId = String(body.partnerId || '').trim();
        record.partnerKey = String(body.partnerKey || '').trim();
      }
      if (!laborGuideConnectionStatus(record).connected && !viaPartstech) {
        throw new HttpError(400, 'MOTOR credentials or viaPartstech are required');
      }
      // When via PartsTech, require PartsTech to already be connected.
      if (viaPartstech) {
        const pt = await readJsonSecret(getSecret, context.shopId, PARTSTECH_SECRET_NAME);
        if (!pt?.userId || !pt?.userKey || !pt?.partnerId || !pt?.partnerKey) {
          throw new HttpError(409, 'Connect PartsTech before enabling MOTOR via PartsTech');
        }
        record.viaPartstech = true;
      }
      await saveSecret(env, context.shopId, LABOR_GUIDE_SECRET_NAME, JSON.stringify(record));
      await recordAudit?.(env, context, { kind: 'integrations.labor_guide.connect', provider: 'motor' });
      return json(laborGuideConnectionStatus(record), 201);
    }

    if (request.method === 'DELETE' && !action) {
      requireRole(context, ADMIN_ROLES);
      await deleteSecret(env, context.shopId, LABOR_GUIDE_SECRET_NAME);
      await recordAudit?.(env, context, { kind: 'integrations.labor_guide.disconnect' });
      return json({ connected: false, provider: 'manual', status: 'not_connected' });
    }

    requireRole(context, USE_ROLES);

    if (action === 'manual' && request.method === 'POST') {
      const body = await requestJson(request);
      return json({ line: createManualLaborEntry(body) });
    }

    if (action === 'search' && request.method === 'POST') {
      const record = await readJsonSecret(getSecret, context.shopId, LABOR_GUIDE_SECRET_NAME);
      const status = laborGuideConnectionStatus(record);
      if (!status.connected || status.provider !== 'motor') {
        throw new HttpError(409, 'MOTOR labor guide is not connected');
      }
      const body = await requestJson(request);
      const vin = String(body.vin || '').trim();
      const keyword = String(body.keyword || '').trim();
      const laborRate = Math.max(0, Number(body.laborRate ?? record.defaultLaborRate) || 0);
      if (!vin && !body.vehicleParams) throw new HttpError(400, 'vin or vehicleParams is required');

      let credentials = record;
      if (record.viaPartstech) {
        credentials = await readJsonSecret(getSecret, context.shopId, PARTSTECH_SECRET_NAME);
        if (!credentials) throw new HttpError(409, 'PartsTech is not connected');
      }

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
        mapMotorLaborOperationToEstimateLine(operation, { laborRate }, index)
      ));
      await recordAudit?.(env, context, { kind: 'integrations.labor_guide.search', vin: vin || null, count: lines.length });
      return json({
        connected: true,
        provider: 'motor',
        groups: Array.isArray(groups) ? groups : [],
        operations: Array.isArray(operations) ? operations : [],
        lines,
      });
    }

    throw new HttpError(404, 'Not found');
  };
}

