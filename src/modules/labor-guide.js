/**
 * Pluggable labor-guide providers. Production paths fail closed when a
 * licensed provider is not connected. Manual entry always works.
 */

export const LABOR_GUIDE_SECRET_NAME = 'labor-guide-credentials';
export const LABOR_GUIDE_PROVIDERS = Object.freeze(['manual', 'motor']);

export function laborGuideConnectionStatus(record) {
  if (!record || typeof record !== 'object') {
    return { connected: false, provider: 'manual', status: 'not_connected', label: 'Labor guide not connected' };
  }
  const provider = String(record.provider || 'manual').toLowerCase();
  if (provider === 'motor') {
    const ready = Boolean(
      record.apiKey
      || (record.userId && record.userKey && record.partnerId && record.partnerKey)
      || record.viaPartstech === true,
    );
    return ready
      ? { connected: true, provider: 'motor', status: 'connected', label: 'MOTOR labor guide connected', connectedAt: record.connectedAt || null, viaPartstech: Boolean(record.viaPartstech) }
      : { connected: false, provider: 'motor', status: 'not_connected', label: 'MOTOR labor guide not connected' };
  }
  return { connected: true, provider: 'manual', status: 'manual', label: 'Manual labor entry' };
}

export function createManualLaborEntry({
  description = 'Labor',
  hours = 0,
  laborRate = 0,
  notes = '',
  id = `labor-manual-${Date.now()}`,
} = {}) {
  const safeHours = Math.max(0, Number(hours) || 0);
  const safeRate = Math.max(0, Number(laborRate) || 0);
  return {
    id: String(id),
    type: 'labor',
    description: String(description || 'Labor'),
    notes: String(notes || ''),
    hours: safeHours,
    laborRate: safeRate,
    quantity: safeHours,
    unitPrice: safeRate,
    total: Math.round(safeHours * safeRate * 100) / 100,
    approvalStatus: 'pending',
    source: 'manual',
    laborGuide: { provider: 'manual' },
  };
}

export function mapMotorLaborOperationToEstimateLine(operation = {}, options = {}, index = 0) {
  const hours = Math.max(0, Number(operation.hours ?? operation.time ?? operation.baseTime ?? 0) || 0);
  const laborRate = Math.max(0, Number(options.laborRate) || 0);
  const description = String(
    operation.description || operation.name || operation.title || operation.operationName || 'Labor operation',
  );
  return {
    id: String(operation.lineId || operation.operationId || operation.id || `motor-labor-${index + 1}`),
    type: 'labor',
    description,
    notes: String(operation.notes || operation.application || ''),
    hours,
    laborRate,
    quantity: hours,
    unitPrice: laborRate,
    total: Math.round(hours * laborRate * 100) / 100,
    approvalStatus: 'pending',
    source: 'motor',
    laborGuide: {
      provider: 'motor',
      operationId: operation.operationId || operation.id || null,
      groupId: operation.groupId || null,
      category: operation.category || null,
    },
  };
}

/** Provider interface used by the Worker and UI. */
export function createLaborGuideProvider(kind, credentials = {}) {
  const provider = String(kind || 'manual').toLowerCase();
  if (provider === 'motor') {
    return {
      id: 'motor',
      connected: laborGuideConnectionStatus({ ...credentials, provider: 'motor' }).connected,
      async search(_query) {
        if (!this.connected) {
          const error = new Error('MOTOR labor guide is not connected');
          error.code = 'not_connected';
          throw error;
        }
        // Real HTTP runs in the Worker adapter; this client-side stub never invents times.
        const error = new Error('Use /api/integrations/labor-guide/search on the Worker');
        error.code = 'use_worker';
        throw error;
      },
      toEstimateLine(operation, options, index) {
        return mapMotorLaborOperationToEstimateLine(operation, options, index);
      },
    };
  }
  return {
    id: 'manual',
    connected: true,
    async search() {
      return { groups: [], operations: [], provider: 'manual' };
    },
    toEstimateLine(entry, options) {
      return createManualLaborEntry({ ...entry, laborRate: entry.laborRate ?? options?.laborRate });
    },
  };
}

export function laborGuidePanelHtml(account = {}, { canSave = false, escapeHtml = v => String(v ?? ''), icon = () => '' } = {}) {
  const status = laborGuideConnectionStatus(account);
  const banner = status.connected && status.provider === 'motor'
    ? `<div class="messaging-status ready">${icon('circle-check', 17)}<div><strong>${escapeHtml(status.label)}</strong><span>MOTOR times via PartsTech taxonomy labor API</span></div></div>`
    : `<div class="messaging-status idle">${icon('book-open', 17)}<div><strong>${escapeHtml(status.label)}</strong><span>Manual labor entry always works. Connect MOTOR (PartsTech labor API) for guide times — never invents hours when disconnected.</span></div></div>`;
  const form = canSave
    ? `<form id="labor-guide-connect-form" class="form-grid">
        <label>Provider<select name="provider"><option value="motor" ${account.provider === 'motor' ? 'selected' : ''}>MOTOR (PartsTech)</option><option value="manual" ${!account.provider || account.provider === 'manual' ? 'selected' : ''}>Manual only</option></select></label>
        <label class="toggle-field full"><input type="checkbox" name="viaPartstech" ${account.viaPartstech !== false ? 'checked' : ''}/><span>Use the shop's PartsTech credentials for MOTOR labor</span></label>
        <button class="primary" type="submit">${icon('save', 14)} Save labor guide</button>
        ${status.provider === 'motor' && status.connected ? `<button class="secondary danger" type="button" id="labor-guide-disconnect">${icon('log-out', 14)} Disconnect MOTOR</button>` : ''}
      </form>`
    : '<p class="ops-note">Ask an owner or admin to connect a labor guide.</p>';
  const search = `<form id="labor-guide-search-form" class="form-grid">
      <label class="full">Operation keyword<input name="keyword" placeholder="front brake pads" ${status.connected && status.provider === 'motor' ? '' : 'disabled'}/></label>
      <label>VIN<input name="vin" ${status.connected && status.provider === 'motor' ? '' : 'disabled'}/></label>
      <label>Labor rate<input name="laborRate" type="number" step=".01" min="0" value="${escapeHtml(account.defaultLaborRate || '')}"/></label>
      <button class="primary" type="submit" ${status.connected && status.provider === 'motor' ? '' : 'disabled'}>${icon('search', 14)} Look up MOTOR times</button>
    </form>
    <form id="manual-labor-form" class="form-grid">
      <label class="full">Manual labor description<input name="description" required placeholder="Diagnose noise"/></label>
      <label>Hours<input name="hours" type="number" step=".1" min="0" value="1" required/></label>
      <label>Rate<input name="laborRate" type="number" step=".01" min="0" value="${escapeHtml(account.defaultLaborRate || '165')}" required/></label>
      <button class="secondary" type="submit">${icon('plus', 14)} Add manual labor line</button>
    </form>
    <div id="labor-guide-results" class="data-panel"></div>`;
  return `<section class="settings-panel labor-guide">
    <div class="statement-head"><div><div class="eyebrow">Labor guide</div><h2>Times &amp; operations</h2><p>Pluggable labor guide with MOTOR adapter and manual entry. Unconfigured providers show not connected and refuse fake times.</p></div>${icon('timer', 20)}</div>
    ${banner}
    ${form}
    ${search}
  </section>`;
}
