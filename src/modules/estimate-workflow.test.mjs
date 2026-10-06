import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvedEstimate,
  billableEstimateLines,
  calculateEstimate,
  declinedEstimate,
  invoiceRecordForOrder,
  invoiceWithEditedWorkOrder,
  normalizeEstimateLine,
  workOrderWithEditedEstimate,
} from './estimate-workflow.js';

test('estimate keeps labor and typed or inventory parts on one card', () => {
  const estimate = calculateEstimate([
    { id: 'labor-1', type: 'labor', description: 'Brake service', hours: 2, laborRate: 165 },
    { id: 'part-1', type: 'part', description: 'Brake rotor', quantity: 2, unitPrice: 95, inventoryId: 'rotor', inventorySku: 'BR-10' },
    { id: 'part-2', type: 'part', description: 'Shop supplied hardware', quantity: 1, unitPrice: 18 },
  ], 8.25, [{ description: 'Shop supplies', amount: 12 }]);

  assert.equal(estimate.labor, 330);
  assert.equal(estimate.parts, 208);
  assert.equal(estimate.subtotal, 550);
  assert.equal(estimate.tax, 45.38);
  assert.equal(estimate.total, 595.38);
  assert.equal(estimate.lines[1].inventorySku, 'BR-10');
});

test('customer decisions retain declined lines while totaling approved work only', () => {
  const estimate = calculateEstimate([
    { id: 'recommended', type: 'labor', description: 'Recommended repair', hours: 1, laborRate: 165 },
    { id: 'part', type: 'part', description: 'Optional part', quantity: 1, unitPrice: 80 },
  ], 8.25);
  const approved = approvedEstimate(estimate, { recommended: 'approved', part: 'declined' });

  assert.equal(approved.approvedLineCount, 1);
  assert.equal(approved.declinedLineCount, 1);
  assert.equal(approved.lines[1].approvalStatus, 'declined');
  assert.equal(approved.subtotal, 165);
  assert.equal(approved.total, 178.61);
});

test('invoice carries approved estimate lines and signature provenance forward', () => {
  const estimate = approvedEstimate(calculateEstimate([
    { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 165 },
    { id: 'declined', type: 'part', description: 'Optional filter', quantity: 1, unitPrice: 35 },
  ], 8.25), { labor: 'approved', declined: 'declined' });
  const issuedAt = new Date('2026-10-02T12:00:00.000Z');
  const invoice = invoiceRecordForOrder({
    id: 'RO-1100',
    customer: 'Customer',
    vehicle: '2020 Example',
    total: estimate.total,
    estimate,
    estimateApproval: { status: 'approved', signedAt: issuedAt.toISOString() },
  }, issuedAt);

  assert.equal(invoice.number, 'INV-1100');
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.lines[0].description, 'Diagnosis');
  assert.equal(invoice.amount, estimate.total);
  assert.equal(invoice.subtotal, estimate.subtotal);
  assert.equal(invoice.tax, estimate.tax);
  assert.equal(invoice.sourceEstimateApproval.status, 'approved');
  assert.equal(invoice.due, '2026-10-16');
});

test('invoice money ignores declined lines even when estimate totals were recomputed from the full card', () => {
  const approved = approvedEstimate(calculateEstimate([
    { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 165 },
    { id: 'part', type: 'part', description: 'Optional sensor', quantity: 1, unitPrice: 100 },
  ], 8.25), { labor: 'approved', part: 'declined' });
  // Simulate coherentOrderEstimate / openOrder which recalculates from all lines.
  const inflated = calculateEstimate(approved.lines, approved.taxRate, approved.fees);
  assert.equal(inflated.lines.length, 2);
  assert.equal(inflated.subtotal, approved.subtotal);
  assert.equal(inflated.tax, approved.tax);
  assert.equal(inflated.total, approved.total);

  const invoice = invoiceRecordForOrder({
    id: 'RO-1100',
    customer: 'Customer',
    vehicle: '2020 Example',
    total: approved.total,
    estimate: inflated,
  }, new Date('2026-10-02T12:00:00.000Z'));

  assert.equal(invoice.amount, 178.61);
  assert.equal(invoice.subtotal, 165);
  assert.equal(invoice.tax, 13.61);
  assert.equal(invoice.lines.length, 1);
  assert.equal(roundMoneySafe(invoice.subtotal + invoice.tax), invoice.amount);
});

function roundMoneySafe(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

test('billableEstimateLines drops declined inventory commitments', () => {
  const lines = [
    { id: 'keep', approvalStatus: 'approved', committedQuantity: 2, inventoryId: 'pad' },
    { id: 'skip', approvalStatus: 'declined', committedQuantity: 4, inventoryId: 'rotor' },
    { id: 'pending', approvalStatus: 'pending', committedQuantity: 1, inventoryId: 'fluid' },
  ];
  assert.deepEqual(billableEstimateLines(lines).map(line => line.id), ['keep', 'pending']);
});

test('full-card decline marks every line declined and zeros money including fees', () => {
  const estimate = calculateEstimate([
    { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 165 },
    { id: 'part', type: 'part', description: 'Sensor', quantity: 1, unitPrice: 100 },
  ], 8.25, [{ description: 'Shop supplies', amount: 12 }]);
  const { estimate: declined, decisions } = declinedEstimate(estimate);

  assert.equal(declined.approvedLineCount, 0);
  assert.equal(declined.declinedLineCount, 2);
  assert.ok(declined.lines.every(line => line.approvalStatus === 'declined'));
  assert.equal(declined.total, 0);
  assert.equal(declined.subtotal, 0);
  assert.equal(declined.tax, 0);
  assert.equal(declined.fees[0].amount, 12);
  assert.deepEqual(decisions, { labor: 'declined', part: 'declined' });

  const invoice = invoiceRecordForOrder({
    id: 'RO-1100',
    customer: 'Customer',
    vehicle: '2020 Example',
    total: declined.total,
    estimate: declined,
    estimateApproval: { status: 'declined' },
  }, new Date('2026-10-02T12:00:00.000Z'));
  assert.equal(invoice.amount, 0);
  assert.equal(invoice.lines.length, 0);
});

test('line normalization uses quantity pricing for parts', () => {
  const line = normalizeEstimateLine({ type: 'part', description: 'Battery', partNumber: 'BAT-48', quantity: 2, unitPrice: 123.45 });
  assert.equal(line.total, 246.9);
  assert.equal(line.hours, 0);
  assert.equal(line.partNumber, 'BAT-48');
});

test('editing approved work order lines recalculates totals and requires renewed approval', () => {
  const revisedAt = '2026-10-06T04:00:00.000Z';
  const revised = workOrderWithEditedEstimate({
    id: 'RO-1056',
    status: 'in_progress',
    linesLockedAt: '2026-10-05T12:00:00.000Z',
    estimateApproval: { status: 'approved', signedAt: '2026-10-05T12:00:00.000Z' },
  }, {
    taxRate: 8.25,
    fees: [{ description: 'Shop supplies', amount: 12 }],
    lines: [
      { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 2, laborRate: 140 },
      { id: 'maf', type: 'part', description: 'MAF sensor', partNumber: 'MAF-1056', quantity: 1, unitPrice: 175 },
    ],
  }, revisedAt);

  assert.equal(revised.labor, 280);
  assert.equal(revised.parts, 175);
  assert.equal(revised.total, 505.53);
  assert.equal(revised.estimate.lines[1].partNumber, 'MAF-1056');
  assert.equal(revised.estimateApproval, null);
  assert.equal(revised.linesLockedAt, null);
  assert.equal(revised.estimateRevisionPending, true);
  assert.equal(revised.status, 'in_progress');
});

test('editing an invoiced work order synchronizes unpaid invoice lines and totals', () => {
  const order = workOrderWithEditedEstimate({ id: 'RO-1056', status: 'invoiced' }, {
    taxRate: 8.25,
    fees: [],
    lines: [
      { id: 'labor', type: 'labor', description: 'MAF diagnosis', hours: 1, laborRate: 140 },
      { id: 'maf', type: 'part', description: 'MAF sensor', partNumber: 'MAF-1056', quantity: 1, unitPrice: 175 },
    ],
  });
  const invoice = invoiceWithEditedWorkOrder({
    number: 'INV-1056',
    signature: { signedAt: '2026-10-05T12:00:00.000Z' },
  }, order, '2026-10-06T04:00:00.000Z');

  assert.equal(invoice.lines.length, 2);
  assert.equal(invoice.lines[1].partNumber, 'MAF-1056');
  assert.equal(invoice.subtotal, 315);
  assert.equal(invoice.tax, 25.99);
  assert.equal(invoice.amount, 340.99);
  assert.equal(invoice.signature, null);
  assert.equal(invoice.revisedAt, '2026-10-06T04:00:00.000Z');
});
