const roundMoney = value => Math.round((Number(value) || 0) * 100) / 100;

export function normalizeEstimateLine(line = {}, index = 0) {
  const type = line.type === 'part' ? 'part' : 'labor';
  const quantity = Math.max(0, Number(line.quantity ?? (type === 'part' ? 1 : line.hours)) || 0);
  const unitPrice = Math.max(0, Number(line.unitPrice ?? (type === 'part' ? line.price : line.laborRate)) || 0);
  const hours = type === 'labor' ? Math.max(0, Number(line.hours ?? quantity) || 0) : 0;
  const laborRate = type === 'labor' ? Math.max(0, Number(line.laborRate ?? unitPrice) || 0) : 0;
  const total = type === 'labor'
    ? roundMoney(hours * laborRate)
    : roundMoney(quantity * unitPrice);
  return {
    ...line,
    id: String(line.id || `line-${index + 1}`),
    type,
    description: String(line.description || line.service || line.name || (type === 'part' ? 'Part' : 'Labor')),
    notes: String(line.notes || line.explanation || ''),
    quantity,
    unitPrice,
    hours,
    laborRate,
    total,
    approvalStatus: ['approved', 'declined'].includes(line.approvalStatus) ? line.approvalStatus : 'pending',
  };
}

export function calculateEstimate(lines = [], taxRate = 0, fees = []) {
  const normalizedLines = lines.map(normalizeEstimateLine);
  const normalizedFees = fees.map(fee => ({
    ...fee,
    description: String(fee.description || 'Fee'),
    amount: roundMoney(Math.max(0, Number(fee.amount) || 0)),
  }));
  const labor = roundMoney(normalizedLines
    .filter(line => line.type === 'labor')
    .reduce((sum, line) => sum + line.total, 0));
  const parts = roundMoney(normalizedLines
    .filter(line => line.type === 'part')
    .reduce((sum, line) => sum + line.total, 0));
  const feeTotal = roundMoney(normalizedFees.reduce((sum, fee) => sum + fee.amount, 0));
  const subtotal = roundMoney(labor + parts + feeTotal);
  const safeTaxRate = Math.max(0, Number(taxRate) || 0);
  const tax = roundMoney(subtotal * safeTaxRate / 100);
  return {
    lines: normalizedLines,
    fees: normalizedFees,
    labor,
    laborHours: roundMoney(normalizedLines.reduce((sum, line) => sum + line.hours, 0)),
    parts,
    subtotal,
    taxRate: safeTaxRate,
    tax,
    total: roundMoney(subtotal + tax),
  };
}

export function approvedEstimate(estimate = {}, decisions = {}) {
  const lines = (estimate.lines || []).map((line, index) => {
    const normalized = normalizeEstimateLine(line, index);
    return {
      ...normalized,
      approvalStatus: decisions[normalized.id] === 'declined' ? 'declined' : 'approved',
    };
  });
  const approvedLines = lines.filter(line => line.approvalStatus === 'approved');
  const totals = calculateEstimate(approvedLines, estimate.taxRate, estimate.fees);
  return {
    ...estimate,
    ...totals,
    lines,
    approvedLineCount: approvedLines.length,
    declinedLineCount: lines.length - approvedLines.length,
  };
}

export function invoiceRecordForOrder(order, issuedAt = new Date()) {
  const estimate = order.estimate || calculateEstimate([], 0);
  const number = `INV-${String(order.id || issuedAt.getTime()).replace(/^RO-/i, '').replace(/[^A-Za-z0-9-]/g, '')}`;
  const due = new Date(issuedAt);
  due.setDate(due.getDate() + 14);
  return {
    id: number,
    number,
    ro: order.id,
    customer: order.customer,
    vehicle: order.vehicle,
    amount: roundMoney(order.total ?? estimate.total),
    subtotal: roundMoney(estimate.subtotal),
    tax: roundMoney(estimate.tax),
    taxRate: Math.max(0, Number(estimate.taxRate) || 0),
    status: 'sent',
    date: issuedAt.toISOString().slice(0, 10),
    due: due.toISOString().slice(0, 10),
    lines: (estimate.lines || []).filter(line => line.approvalStatus !== 'declined').map(normalizeEstimateLine),
    sourceEstimateApproval: order.estimateApproval || null,
    createdAt: issuedAt.toISOString(),
  };
}
