import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MILEAGE_RATE,
  applyMileageToEstimate,
  applyMileageToOrder,
  mileageCharge,
  mileageLineItem,
  normalizeMileageRate,
  roundTripMiles,
  stripMileageLines,
} from './mileage.js';

test('default mileage rate is 68 cents', () => {
  assert.equal(DEFAULT_MILEAGE_RATE, 0.68);
  assert.equal(normalizeMileageRate(undefined), 0.68);
  assert.equal(normalizeMileageRate(-1), 0.68);
  assert.equal(normalizeMileageRate(0.75), 0.75);
});

test('round trip doubles one-way miles', () => {
  assert.equal(roundTripMiles(12.5), 25);
  assert.equal(roundTripMiles(0), 0);
  assert.equal(mileageCharge(25, 0.68), 17);
});

test('mileage line item describes to/from travel', () => {
  const line = mileageLineItem(42, 0.68);
  assert.equal(line.kind, 'mileage');
  assert.equal(line.miles, 42);
  assert.equal(line.total, 28.56);
  assert.match(line.service, /to and from/i);
  assert.match(line.notes, /42\.0 miles @ \$0\.68\/mi/);
});

test('applyMileageToEstimate replaces prior mileage line and updates totals', () => {
  const estimate = applyMileageToEstimate({
    lines: [
      { service: 'Oil change', hours: 0.5, labor: 82.5, parts: 40, total: 122.5 },
      { kind: 'mileage', service: 'old', parts: 10, total: 10, labor: 0, hours: 0 },
    ],
    fees: [{ description: 'Shop supplies', amount: 12 }],
  }, 20, 0.68, 8.25);

  assert.equal(stripMileageLines(estimate.lines).length, 1);
  assert.equal(estimate.lines.filter((line) => line.kind === 'mileage').length, 1);
  assert.equal(estimate.mileageCharge, 13.6);
  assert.equal(estimate.parts, 53.6);
  assert.equal(estimate.subtotal, 148.1);
  assert.equal(estimate.tax, 12.22);
  assert.equal(estimate.total, 160.32);
});

test('applyMileageToOrder stores trip fields and invoice-ready estimate', () => {
  const order = applyMileageToOrder({
    labor: 165,
    laborHours: 1,
    parts: 50,
    tax: 17.74,
    total: 232.74,
    estimate: {
      lines: [{ service: 'Diag', hours: 1, labor: 165, parts: 50, total: 215 }],
      fees: [{ description: 'Shop supplies', amount: 12 }],
      labor: 165,
      laborHours: 1,
      parts: 50,
      subtotal: 227,
      tax: 18.73,
      taxRate: 8.25,
      total: 245.73,
    },
  }, { oneWayMiles: 10, jobAddress: '500 Main St', rate: 0.68, taxRate: 8.25 });

  assert.equal(order.tripMilesOneWay, 10);
  assert.equal(order.tripMiles, 20);
  assert.equal(order.mileageCharge, 13.6);
  assert.equal(order.jobAddress, '500 Main St');
  assert.equal(order.estimate.lines.at(-1).kind, 'mileage');
  assert.equal(order.total, order.estimate.total);
});
