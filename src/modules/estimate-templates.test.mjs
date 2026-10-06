import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REFERENCE_ESTIMATE,
  calculateShopEstimate,
  estimateFromAssistantDraft,
  workOrderDraftFromEstimate,
} from './estimate-templates.js';
import { approvedEstimate } from './estimate-workflow.js';

test('reference estimate matches the authoritative shop figures', () => {
  assert.equal(REFERENCE_ESTIMATE.parts, 1364.79);
  assert.equal(REFERENCE_ESTIMATE.laborHours, 5.3);
  assert.equal(REFERENCE_ESTIMATE.labor, 742);
  assert.deepEqual(REFERENCE_ESTIMATE.fees, [{ description: 'Shop supplies', amount: 20 }]);
  assert.equal(REFERENCE_ESTIMATE.discountAmount, 212.68);
  assert.equal(REFERENCE_ESTIMATE.tax, 157.91);
  assert.equal(REFERENCE_ESTIMATE.total, 2072.02);
  assert.equal(approvedEstimate(REFERENCE_ESTIMATE).total, REFERENCE_ESTIMATE.total);
  assert.deepEqual(
    REFERENCE_ESTIMATE.lines.find(line => line.type === 'labor').technicianIds,
    [],
  );
});

test('shop rules apply supplies at three percent of labor capped at twenty dollars', () => {
  const small = calculateShopEstimate([
    { type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 140 },
  ]);
  const capped = calculateShopEstimate([
    { type: 'labor', description: 'Repair', hours: 5, laborRate: 140 },
  ]);
  const explicitOverride = calculateShopEstimate([
    { type: 'labor', description: 'Repair', hours: 5, laborRate: 140 },
  ], { shopSupplies: 100 });
  const partsOnly = calculateShopEstimate([
    { type: 'part', description: 'Part', quantity: 1, unitPrice: 100 },
  ]);

  assert.equal(small.fees[0].amount, 4.2);
  assert.equal(capped.fees[0].amount, 20);
  assert.equal(explicitOverride.fees[0].amount, 20);
  assert.deepEqual(partsOnly.fees, []);
});

test('reference work-order fill is explicit data and preserves sensitive shop notes off the estimate', () => {
  const draft = workOrderDraftFromEstimate();
  assert.equal(draft.customer, 'Jordan Example');
  assert.equal(draft.vehicle, '2016 Mercedes-Benz GLA250');
  assert.equal(draft.vin, 'DEMO-VEHICLE-VIN');
  assert.equal(draft.estimate.total, 2072.02);
  assert.match(draft.complaint, /Open Labor Project/);
  assert.match(draft.complaint, /Obtain written authorization/);
  assert.equal(REFERENCE_ESTIMATE.customer.email, 'customer@example.test');
  assert.equal(REFERENCE_ESTIMATE.insurance.policy, 'TEST-POLICY-001');
  assert.equal('dob' in REFERENCE_ESTIMATE.customer, false);
  assert.equal('driverLicense' in REFERENCE_ESTIMATE.customer, false);
});

test('assistant draft totals are recomputed with shop rules instead of trusting model totals', () => {
  const estimate = estimateFromAssistantDraft({
    draft: {
      customer: { name: 'Caller' },
      vehicle: { description: '2020 Example' },
      complaint: 'Noise',
      requestedServices: ['Inspect noise'],
      parts: [{ description: 'Part', quantity: 1, unitPrice: 100 }],
      labor: [{ description: 'Inspection', hours: 1, source: 'Caller estimate' }],
      total: 1,
    },
  }, {
    laborRate: 175,
    taxRate: 6.5,
  });

  assert.equal(estimate.labor, 175);
  assert.equal(estimate.parts, 100);
  assert.equal(estimate.fees[0].amount, 5.25);
  assert.equal(estimate.taxRate, 6.5);
  assert.equal(estimate.tax, 18.22);
  assert.equal(estimate.total, 298.47);
});
