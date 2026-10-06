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

test('mileage-only estimate preview includes mileage and tax', () => {
  const estimate = applyMileageToEstimate({ lines: [], fees: [] }, 20, 0.68, 8.25);

  assert.equal(estimate.mileageCharge, 13.6);
  assert.equal(estimate.tax, 1.12);
  assert.equal(estimate.total, 14.72);
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

test('applyMileageToOrder does not duplicate or retain a mileage-only charge', () => {
  const order = applyMileageToOrder({
    tripMilesOneWay: 10,
    tripMiles: 20,
    mileageRate: 0.68,
    mileageCharge: 13.6,
    labor: 0,
    laborHours: 0,
    parts: 13.6,
    tax: 1.12,
    total: 14.72,
    estimate: {
      lines: [mileageLineItem(20, 0.68)],
      fees: [],
      labor: 0,
      laborHours: 0,
      parts: 13.6,
      subtotal: 13.6,
      tax: 1.12,
      taxRate: 8.25,
      total: 14.72,
    },
  }, { oneWayMiles: 10, rate: 0.68, taxRate: 8.25 });

  assert.equal(order.total, 14.72);
  assert.equal(order.estimate.lines.filter((line) => line.kind === 'mileage').length, 1);

  const cleared = applyMileageToOrder(order, { oneWayMiles: 0, rate: 0.68, taxRate: 8.25 });
  assert.equal(cleared.mileageCharge, 0);
  assert.equal(cleared.estimate.lines.some((line) => line.kind === 'mileage'), false);
  assert.equal(cleared.total, 0);
});

test('applyMileageToOrder preserves parts when recalculating mileage without an estimate', () => {
  const order = applyMileageToOrder({
    labor: 0,
    laborHours: 0,
    parts: 50,
    tax: 0,
    total: 63.6,
    mileageCharge: 13.6,
  }, { oneWayMiles: 10, rate: 0.68, taxRate: 0 });

  assert.equal(order.estimate.parts, 63.6);
  assert.equal(order.total, 63.6);
});

test('applyMileageToOrder preserves stored work-order hours over estimate hours', () => {
  const withLines = applyMileageToOrder({
    laborHours: 3,
    estimate: {
      lines: [{ service: 'Diag', hours: 1, labor: 165, parts: 0, total: 165 }],
      labor: 165,
      laborHours: 1,
      parts: 0,
      fees: [],
    },
  }, { oneWayMiles: 0 });
  const snapshot = applyMileageToOrder({
    laborHours: 3,
    estimate: {
      lines: [],
      labor: 165,
      laborHours: 1,
      parts: 0,
      subtotal: 165,
      tax: 0,
      total: 165,
    },
  }, { oneWayMiles: 0 });

  assert.equal(withLines.laborHours, 3);
  assert.equal(snapshot.laborHours, 3);
});

test('applyMileageToOrder preserves aggregate-only imported charges', () => {
  const order = applyMileageToOrder({
    total: 89.95,
    labor: 0,
    laborHours: 0,
    parts: 0,
    tax: 0,
  }, { oneWayMiles: 0, taxRate: 8.25 });

  assert.equal(order.estimate.subtotal, 89.95);
  assert.equal(order.total, 89.95);
  assert.equal(order.tax, 0);

  const withMileage = applyMileageToOrder(order, { oneWayMiles: 10, taxRate: 8.25 });
  assert.equal(withMileage.estimate.subtotal, 103.55);
  assert.equal(withMileage.tax, 1.12);
  assert.equal(withMileage.total, 104.67);

  const savedAgain = applyMileageToOrder(withMileage, { oneWayMiles: 10, taxRate: 8.25 });
  assert.equal(savedAgain.total, withMileage.total);
  assert.equal(savedAgain.tax, withMileage.tax);

  const importedTax = applyMileageToOrder({
    total: 97.37,
    labor: 0,
    laborHours: 0,
    parts: 0,
    tax: 7.42,
  }, { oneWayMiles: 10, taxRate: 8.25 });
  assert.equal(importedTax.estimate.subtotal, 103.55);
  assert.equal(importedTax.tax, 8.54);
  assert.equal(importedTax.total, 112.09);
});
