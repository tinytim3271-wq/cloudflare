/**
 * End-to-end repair-order flow: inspection (DVI) → estimate → customer
 * line-level approval → repair/work order → invoice → payment.
 * Status changes append an audit trail; no sample/fake production data.
 */

import {
  approvedEstimate,
  billableEstimateLines,
  calculateEstimate,
  invoiceRecordForOrder,
  normalizeEstimateLine,
} from './estimate-workflow.js';

export const REPAIR_FLOW_STATUSES = Object.freeze([
  'intake',
  'inspecting',
  'estimate_draft',
  'awaiting_approval',
  'approved',
  'declined',
  'in_progress',
  'waiting_parts',
  'completed',
  'invoiced',
  'paid',
]);

const TRANSITIONS = Object.freeze({
  intake: ['inspecting', 'estimate_draft'],
  inspecting: ['estimate_draft', 'awaiting_approval'],
  estimate_draft: ['awaiting_approval', 'declined'],
  awaiting_approval: ['approved', 'declined', 'estimate_draft'],
  approved: ['in_progress', 'waiting_parts', 'completed', 'invoiced'],
  declined: ['estimate_draft'],
  in_progress: ['waiting_parts', 'completed', 'invoiced'],
  waiting_parts: ['in_progress', 'completed'],
  completed: ['invoiced'],
  invoiced: ['paid'],
  paid: [],
});

const FINDING_STATUSES = new Set(['soon', 'critical', 'attention', 'fail', 'monitor']);

function isoNow(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return value;
  return new Date().toISOString();
}

export function normalizeFlowStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  return REPAIR_FLOW_STATUSES.includes(value) ? value : null;
}

export function canTransitionRepairFlow(from, to) {
  const current = normalizeFlowStatus(from) || 'intake';
  const next = normalizeFlowStatus(to);
  if (!next) return false;
  if (current === next) return true;
  return (TRANSITIONS[current] || []).includes(next);
}

export function appendFlowAuditEvent(order = {}, event = {}, at = new Date()) {
  const timestamp = isoNow(at);
  const entry = {
    at: timestamp,
    type: String(event.type || 'note').trim() || 'note',
    from: event.from ? String(event.from) : null,
    to: event.to ? String(event.to) : null,
    actorId: event.actorId ? String(event.actorId) : null,
    actorName: event.actorName ? String(event.actorName) : null,
    note: String(event.note || '').trim().slice(0, 500),
    meta: event.meta && typeof event.meta === 'object' ? event.meta : undefined,
  };
  const flowAudit = [...(order.flowAudit || []), entry].slice(-200);
  return { ...order, flowAudit, updatedAt: timestamp };
}

export function advanceRepairFlowStatus(order = {}, nextStatus, actor = {}, at = new Date()) {
  const current = normalizeFlowStatus(order.flowStatus || order.status) || 'intake';
  const next = normalizeFlowStatus(nextStatus);
  if (!next) throw new Error('Unknown repair-flow status');
  if (!canTransitionRepairFlow(current, next)) {
    throw new Error(`Cannot move repair flow from ${current} to ${next}`);
  }
  const stamped = appendFlowAuditEvent(order, {
    type: 'status',
    from: current,
    to: next,
    actorId: actor.id || actor.userId,
    actorName: actor.name || actor.email,
    note: actor.note || '',
  }, at);
  return {
    ...stamped,
    flowStatus: next,
    status: next === 'estimate_draft' ? 'estimate' : next,
  };
}

/**
 * Turn DVI findings into estimate labor/part placeholders.
 * Critical/soon/fail items become labor lines; photos stay referenced for audit.
 */
export function inspectionFindingsToEstimateLines(inspection = {}, options = {}) {
  const laborRate = Math.max(0, Number(options.laborRate) || 0);
  const items = Array.isArray(inspection.items) ? inspection.items : [];
  const lines = [];
  let index = 0;
  for (const item of items) {
    const status = String(item.status || '').toLowerCase();
    if (!FINDING_STATUSES.has(status)) continue;
    index += 1;
    const label = String(item.label || item.name || `Finding ${index}`).trim();
    const note = String(item.note || item.measurement || '').trim();
    lines.push(normalizeEstimateLine({
      id: `insp-${inspection.id || 'dvi'}-${item.id || index}`,
      type: 'labor',
      description: label,
      notes: [status, note].filter(Boolean).join(' — '),
      hours: Number(item.suggestedHours) > 0 ? Number(item.suggestedHours) : 0,
      laborRate,
      source: 'inspection',
      inspectionItemId: item.id || null,
      inspectionStatus: status,
      photoKeys: Array.isArray(item.photoKeys) ? item.photoKeys : undefined,
    }, index - 1));
  }
  const photoKeys = Array.isArray(inspection.photoKeys) ? inspection.photoKeys.filter(Boolean) : [];
  return {
    lines,
    photoKeys,
    recommendations: String(inspection.recommendations || '').trim(),
    inspectionId: inspection.id || null,
    catalogId: inspection.catalogId || null,
  };
}

export function estimateFromInspection(inspection = {}, options = {}, at = new Date()) {
  const built = inspectionFindingsToEstimateLines(inspection, options);
  const taxRate = Math.max(0, Number(options.taxRate) || 0);
  const estimate = calculateEstimate(built.lines, taxRate, options.fees || []);
  return {
    ...estimate,
    summary: built.recommendations || options.summary || '',
    generatedAt: isoNow(at),
    sourceInspectionId: built.inspectionId,
    sourceCatalogId: built.catalogId,
    photoKeys: built.photoKeys,
  };
}

export function applyEstimateFromInspection(order = {}, inspection = {}, options = {}, actor = {}, at = new Date()) {
  const estimate = estimateFromInspection(inspection, {
    laborRate: options.laborRate ?? order.laborRate,
    taxRate: options.taxRate ?? order.estimate?.taxRate,
    fees: options.fees || order.estimate?.fees || [],
    summary: options.summary,
  }, at);
  let next = {
    ...order,
    estimate,
    labor: estimate.labor,
    laborHours: estimate.laborHours,
    parts: estimate.parts,
    tax: estimate.tax,
    total: estimate.total,
    inspectionId: inspection.id || order.inspectionId || null,
    inspectionPhotoKeys: estimate.photoKeys,
  };
  next = advanceRepairFlowStatus(next, 'estimate_draft', actor, at);
  return appendFlowAuditEvent(next, {
    type: 'estimate_from_inspection',
    actorId: actor.id || actor.userId,
    actorName: actor.name || actor.email,
    note: `Built estimate from inspection ${inspection.id || ''}`.trim(),
    meta: { inspectionId: inspection.id || null, lineCount: estimate.lines.length },
  }, at);
}

export function markAwaitingCustomerApproval(order = {}, delivery = {}, actor = {}, at = new Date()) {
  const channels = []
    .concat(delivery.channels || [])
    .concat(delivery.channel ? [delivery.channel] : [])
    .map(value => String(value).toLowerCase())
    .filter(value => value === 'sms' || value === 'email' || value === 'link');
  let next = advanceRepairFlowStatus(order, 'awaiting_approval', actor, at);
  next = {
    ...next,
    approvalDelivery: {
      channels: [...new Set(channels)],
      linkUrl: delivery.linkUrl ? String(delivery.linkUrl) : null,
      sentAt: isoNow(at),
      toPhone: delivery.toPhone || null,
      toEmail: delivery.toEmail || null,
    },
  };
  return appendFlowAuditEvent(next, {
    type: 'approval_sent',
    actorId: actor.id || actor.userId,
    actorName: actor.name || actor.email,
    note: `Approval link sent via ${(next.approvalDelivery.channels || []).join(', ') || 'link'}`,
    meta: { channels: next.approvalDelivery.channels },
  }, at);
}

export function applyCustomerLineDecisions(order = {}, decisions = {}, approval = {}, at = new Date()) {
  const estimate = approvedEstimate(order.estimate || {}, decisions);
  const declinedAll = estimate.approvedLineCount === 0;
  const status = declinedAll ? 'declined' : 'approved';
  let next = {
    ...order,
    estimate,
    labor: estimate.labor,
    laborHours: estimate.laborHours,
    parts: estimate.parts,
    tax: estimate.tax,
    total: estimate.total,
    estimateApproval: approval || order.estimateApproval || null,
    linesLockedAt: declinedAll ? null : isoNow(at),
  };
  next = advanceRepairFlowStatus(next, status, {
    id: approval?.recordedBy?.id,
    name: approval?.authorizationName || approval?.recordedBy?.name || 'Customer',
  }, at);
  return next;
}

export function repairOrderFromApprovedEstimate(order = {}, at = new Date()) {
  if (normalizeFlowStatus(order.flowStatus || order.status) !== 'approved'
    && order.estimateApproval?.status !== 'approved') {
    throw new Error('Approve at least one estimate line before starting the repair order');
  }
  const lines = billableEstimateLines(order.estimate?.lines || [])
    .map((line, index) => normalizeEstimateLine(line, index));
  if (!lines.length) throw new Error('No approved lines to work');
  return advanceRepairFlowStatus({
    ...order,
    workLines: lines,
    workStartedAt: order.workStartedAt || isoNow(at),
  }, 'in_progress', { name: 'system' }, at);
}

export function invoiceFromRepairOrder(order = {}, at = new Date()) {
  const invoice = invoiceRecordForOrder(order, at instanceof Date ? at : new Date(at));
  const next = advanceRepairFlowStatus({
    ...order,
    invoiceId: invoice.id,
    invoicedAt: invoice.createdAt,
  }, 'invoiced', { name: 'system' }, at);
  return { order: next, invoice };
}

export function markRepairOrderPaid(order = {}, payment = {}, at = new Date()) {
  const next = advanceRepairFlowStatus({
    ...order,
    payment: {
      id: payment.id || null,
      method: payment.method || 'stripe',
      amount: Number(payment.amount) || Number(order.total) || 0,
      receivedAt: isoNow(at),
    },
  }, 'paid', { name: payment.actorName || 'system' }, at);
  return next;
}
