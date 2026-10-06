import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAiWorkflowEstimate } from './ai-workflow.js';

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
