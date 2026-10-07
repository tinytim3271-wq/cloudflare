import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_CUSTOM_LABEL_MAX } from '../../src/modules/estimate-approval.js';
import { validatedOrderApproval } from '../src/index.js';

const context = {
  userId: 'staff-7',
  name: 'Timothy Alderman',
  email: 'timothy@example.test',
};

const otherApproval = customLabel => ({
  id: 'RO-1200',
  estimateApproval: {
    status: 'approved',
    type: 'other',
    customLabel,
    authorizationName: 'Dana Fleet',
    approvedAt: '2026-10-07T20:00:00.000Z',
    note: 'Confirmed PO 447',
    recordedBy: { id: 'spoofed', name: 'Spoofed User' },
  },
});

test('Worker validates and normalizes Other approvals while binding the current staff recorder', () => {
  const order = validatedOrderApproval(
    otherApproval('  Approved via fleet manager email  '),
    context,
  );
  assert.equal(order.estimateApproval.type, 'other');
  assert.equal(order.estimateApproval.customLabel, 'Approved via fleet manager email');
  assert.deepEqual(order.estimateApproval.recordedBy, {
    id: context.userId,
    name: context.name,
    email: context.email,
  });
});

test('Worker rejects missing and whitespace-only Other labels', () => {
  for (const value of ['', '   ']) {
    assert.throws(
      () => validatedOrderApproval(otherApproval(value), context),
      error => error.status === 400 && /Custom approval type is required/.test(error.message),
    );
  }
});

test('Worker rejects overlength Other labels', () => {
  assert.throws(
    () => validatedOrderApproval(otherApproval('x'.repeat(APPROVAL_CUSTOM_LABEL_MAX + 1)), context),
    error => error.status === 400 && /characters or fewer/.test(error.message),
  );
});
