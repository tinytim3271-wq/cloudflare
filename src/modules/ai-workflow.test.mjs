import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiWorkflowEstimate, stopMediaCapture } from './ai-workflow.js';

test('AI workflow estimate remains active after save for invoice generation', () => {
  const order = {
    estimate: { total: 100, lines: [] },
    labor: 80,
    parts: 20,
    total: 100,
  };
  const workflowEstimate = {
    subtotal: 180,
    tax: 14.85,
    total: 194.85,
    lines: [
      { hours: 1, labor: 120, parts: 30 },
      { hours: 0.5, labor: 30, parts: 0 },
    ],
  };

  applyAiWorkflowEstimate(order, workflowEstimate);
  const savedOrder = JSON.parse(JSON.stringify(order));
  const invoiceEstimate = savedOrder.estimate;

  assert.deepEqual(invoiceEstimate, workflowEstimate);
  assert.equal(savedOrder.laborHours, 1.5);
  assert.equal(savedOrder.labor, 150);
  assert.equal(savedOrder.parts, 30);
  assert.equal(savedOrder.total, 194.85);
  assert.equal(invoiceEstimate.total, savedOrder.total);
});

test('AI workflow estimate reapplies stored mileage with shop settings', () => {
  const order = {
    tripMilesOneWay: 10,
    mileageCharge: 13.6,
    estimate: { lines: [], taxRate: 0 },
    labor: 0,
    parts: 0,
    tax: 0,
    total: 13.6,
  };
  const workflowEstimate = {
    subtotal: 150,
    tax: 0,
    total: 150,
    fees: [],
    lines: [{ hours: 1, labor: 150, parts: 0, total: 150 }],
  };

  applyAiWorkflowEstimate(order, workflowEstimate, { rate: 0.68, taxRate: 8.25 });

  assert.equal(order.tripMiles, 20);
  assert.equal(order.mileageCharge, 13.6);
  assert.equal(order.estimate.lines.filter((line) => line.kind === 'mileage').length, 1);
  assert.equal(order.estimate.taxRate, 8.25);
  assert.equal(order.tax, 13.5);
  assert.equal(order.total, 177.1);
  assert.equal(order.total, order.estimate.total);
});

test('media cleanup stops an active recorder and every microphone track', () => {
  let recorderStopped = false;
  const trackStops = [false, false];
  const recorder = { state: 'recording', stop: () => { recorderStopped = true; } };
  const stream = {
    getTracks: () => trackStops.map((_, index) => ({
      stop: () => { trackStops[index] = true; },
    })),
  };

  stopMediaCapture(recorder, stream);

  assert.equal(recorderStopped, true);
  assert.deepEqual(trackStops, [true, true]);
});
