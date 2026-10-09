import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRepairFlowStatus,
  applyCustomerLineDecisions,
  applyEstimateFromInspection,
  canTransitionRepairFlow,
  estimateFromInspection,
  invoiceFromRepairOrder,
  markAwaitingCustomerApproval,
  markRepairOrderPaid,
  repairOrderFromApprovedEstimate,
} from './repair-order-flow.js';

test('inspection findings become estimate lines without inventing prices', () => {
  const estimate = estimateFromInspection({
    id: 'insp-1',
    photoKeys: ['shops/a/photo1.jpg'],
    recommendations: 'Replace pads',
    items: [
      { id: 'pads', label: 'Front pads', status: 'critical', note: '2mm', suggestedHours: 1.5 },
      { id: 'ok', label: 'Fluid', status: 'ok' },
    ],
  }, { laborRate: 165, taxRate: 8.25 });

  assert.equal(estimate.lines.length, 1);
  assert.equal(estimate.lines[0].hours, 1.5);
  assert.equal(estimate.lines[0].laborRate, 165);
  assert.equal(estimate.lines[0].total, 247.5);
  assert.deepEqual(estimate.photoKeys, ['shops/a/photo1.jpg']);
  assert.equal(estimate.sourceInspectionId, 'insp-1');
});

test('repair flow advances inspection → approval → invoice → paid with audit', () => {
  let order = { id: 'RO-1', status: 'intake', customer: 'Pat', vehicle: 'Truck' };
  order = applyEstimateFromInspection(order, {
    id: 'insp-2',
    items: [{ id: 'a', label: 'Seals', status: 'soon', suggestedHours: 2 }],
  }, { laborRate: 100, taxRate: 0 }, { id: 'u1', name: 'Tech' });
  assert.equal(order.flowStatus, 'estimate_draft');
  assert.equal(order.estimate.lines.length, 1);

  order = markAwaitingCustomerApproval(order, {
    channels: ['sms', 'email'],
    linkUrl: 'https://example.test/d/token',
    toPhone: '+15551212',
  }, { name: 'Writer' });
  assert.equal(order.flowStatus, 'awaiting_approval');
  assert.deepEqual(order.approvalDelivery.channels, ['sms', 'email']);

  order = applyCustomerLineDecisions(order, { [order.estimate.lines[0].id]: 'approved' }, {
    status: 'approved',
    authorizationName: 'Pat',
    type: 'text',
  });
  assert.equal(order.flowStatus, 'approved');
  assert.ok(order.linesLockedAt);

  order = repairOrderFromApprovedEstimate(order);
  assert.equal(order.flowStatus, 'in_progress');
  assert.equal(order.workLines.length, 1);

  const { order: invoiced, invoice } = invoiceFromRepairOrder(order, new Date('2026-10-08T12:00:00Z'));
  assert.equal(invoiced.flowStatus, 'invoiced');
  assert.equal(invoice.ro, 'RO-1');
  assert.ok(invoice.amount > 0);

  const paid = markRepairOrderPaid(invoiced, { id: 'pay-1', method: 'stripe', amount: invoice.amount });
  assert.equal(paid.flowStatus, 'paid');
  assert.ok(paid.flowAudit.length >= 5);
  assert.equal(canTransitionRepairFlow('paid', 'in_progress'), false);
});

test('illegal transitions throw', () => {
  assert.throws(() => advanceRepairFlowStatus({ flowStatus: 'intake' }, 'paid'), /Cannot move/);
});
