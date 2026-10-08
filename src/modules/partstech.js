/** PartsTech parts search/quote/order helpers for estimate and RO screens. */

export const PARTSTECH_API_BASE = 'https://api.partstech.com';
export const PARTSTECH_SECRET_NAME = 'partstech-credentials';

export function partstechConnectionStatus(record) {
  if (!record || typeof record !== 'object') {
    return { connected: false, status: 'not_connected', label: 'PartsTech not connected' };
  }
  const hasUser = Boolean(record.userId && record.userKey);
  const hasPartner = Boolean(record.partnerId && record.partnerKey);
  if (!hasUser || !hasPartner) {
    return { connected: false, status: 'not_connected', label: 'PartsTech not connected' };
  }
  return {
    connected: true,
    status: 'connected',
    label: 'PartsTech connected',
    userId: record.userId,
    partnerId: record.partnerId,
    storeId: record.storeId || null,
    connectedAt: record.connectedAt || null,
  };
}

export function mapPartstechQuoteItemToEstimateLine(item = {}, index = 0) {
  const quantity = Math.max(0, Number(item.quantity ?? item.qty ?? 1) || 0);
  const unitPrice = Math.max(0, Number(item.price ?? item.unitPrice ?? item.cost ?? 0) || 0);
  const partNumber = String(item.partNumber || item.part_number || item.sku || item.brandPartNumber || '');
  const brand = String(item.brand || item.manufacturer || '');
  const description = String(
    item.description || item.name || item.title || [brand, partNumber].filter(Boolean).join(' ') || 'Part',
  );
  return {
    id: String(item.lineId || item.id || `pt-part-${index + 1}`),
    type: 'part',
    description,
    partNumber,
    quantity,
    unitPrice,
    hours: 0,
    laborRate: 0,
    total: Math.round(quantity * unitPrice * 100) / 100,
    approvalStatus: 'pending',
    source: 'partstech',
    partstech: {
      partId: item.partId || item.id || null,
      storeId: item.storeId || null,
      supplier: item.supplier || item.seller || null,
      availability: item.availability || item.stock || null,
      quoteId: item.quoteId || null,
    },
  };
}

export function mapPartstechOrderSummary(order = {}) {
  return {
    orderId: String(order.orderId || order.id || ''),
    status: String(order.status || order.state || 'submitted'),
    total: Number(order.total || order.amount || 0) || 0,
    storeId: order.storeId || null,
    placedAt: order.placedAt || order.createdAt || null,
    items: Array.isArray(order.items || order.parts)
      ? (order.items || order.parts).map((item, index) => mapPartstechQuoteItemToEstimateLine(item, index))
      : [],
  };
}

export function partstechPanelHtml(account = {}, { canSave = false, escapeHtml = v => String(v ?? ''), icon = () => '' } = {}) {
  const status = partstechConnectionStatus(account);
  const banner = status.connected
    ? `<div class="messaging-status ready">${icon('circle-check', 17)}<div><strong>${escapeHtml(status.label)}</strong><span>User ${escapeHtml(status.userId || '')}${status.storeId ? ` · store ${escapeHtml(status.storeId)}` : ''}</span></div></div>`
    : `<div class="messaging-status idle">${icon('lock', 17)}<div><strong>${escapeHtml(status.label)}</strong><span>Connect PartsTech with partner and user API keys. Search, quote, and order stay server-side; unconfigured shops fail closed.</span></div></div>`;
  const form = canSave
    ? `<form id="partstech-connect-form" class="form-grid">
        <label>Partner ID<input name="partnerId" autocomplete="off" value="${escapeHtml(account.partnerId || '')}" required/></label>
        <label>Partner API key<input name="partnerKey" type="password" autocomplete="new-password" required/></label>
        <label>User ID<input name="userId" autocomplete="off" value="${escapeHtml(account.userId || '')}" required/></label>
        <label>User API key<input name="userKey" type="password" autocomplete="new-password" required/></label>
        <label>Default store ID<input name="storeId" value="${escapeHtml(account.storeId || '')}" placeholder="Optional"/></label>
        <button class="primary" type="submit">${icon('save', 14)} Save PartsTech</button>
        ${status.connected ? `<button class="secondary danger" type="button" id="partstech-disconnect">${icon('log-out', 14)} Disconnect</button>` : ''}
      </form>`
    : '<p class="ops-note">Ask an owner or admin to connect PartsTech.</p>';
  const search = `<form id="partstech-search-form" class="form-grid">
      <label class="full">Keyword or part number<input name="keyword" placeholder="brake pad" ${status.connected ? '' : 'disabled'}/></label>
      <label>VIN<input name="vin" placeholder="Optional VIN" ${status.connected ? '' : 'disabled'}/></label>
      <label>Store ID<input name="storeId" value="${escapeHtml(account.storeId || '')}" ${status.connected ? '' : 'disabled'}/></label>
      <button class="primary" type="submit" ${status.connected ? '' : 'disabled'}>${icon('search', 14)} Quote parts</button>
    </form>
    <div id="partstech-results" class="data-panel"></div>`;
  return `<section class="settings-panel partstech-ordering">
    <div class="statement-head"><div><div class="eyebrow">Parts ordering</div><h2>PartsTech</h2><p>Search and quote parts through PartsTech, add lines to the estimate, then place the order. Credentials are encrypted in D1.</p></div>${icon('package', 20)}</div>
    ${banner}
    ${form}
    ${search}
  </section>`;
}
