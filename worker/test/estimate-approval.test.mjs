import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_CUSTOM_LABEL_MAX } from '../../src/modules/estimate-approval.js';
import { validatedOrderApproval } from '../src/index.js';

const context = {
  shopId: 'shop-1',
  userId: 'staff-7',
  name: 'Timothy Alderman',
  email: 'timothy@example.test',
  role: 'service_writer',
};

const serverTimestamp = '2026-10-07T21:45:00.000Z';

const existingOrder = () => ({
  id: 'RO-1200',
  status: 'estimate',
  estimate: {
    taxRate: 0,
    fees: [],
    lines: [
      { id: 'labor', type: 'labor', description: 'Diagnosis', hours: 1, laborRate: 140 },
      { id: 'part', type: 'part', description: 'Sensor', quantity: 1, unitPrice: 100 },
    ],
  },
});

const otherApproval = customLabel => ({
  id: 'RO-1200',
  status: 'invoiced',
  total: 99999,
  linesLockedAt: '2000-01-01T00:00:00.000Z',
  estimateApproval: {
    status: 'approved',
    type: 'other',
    customLabel,
    authorizationName: 'Dana Fleet',
    approvedAt: '2026-10-07T20:00:00.000Z',
    note: 'Confirmed PO 447',
    recordedBy: { id: 'spoofed', name: 'Spoofed User' },
    decisions: { labor: 'approved', part: 'declined' },
  },
});

test('Worker derives approval time, recorder, decisions, totals, status, and lock state', () => {
  const order = validatedOrderApproval(
    otherApproval('  Approved via fleet manager email  '),
    context,
    existingOrder(),
    serverTimestamp,
  );
  assert.equal(order.estimateApproval.type, 'other');
  assert.equal(order.estimateApproval.customLabel, 'Approved via fleet manager email');
  assert.equal(order.estimateApproval.approvedAt, serverTimestamp);
  assert.deepEqual(order.estimateApproval.recordedBy, {
    id: context.userId,
    name: context.name,
    email: context.email,
  });
  assert.equal(order.status, 'approved');
  assert.equal(order.linesLockedAt, serverTimestamp);
  assert.equal(order.total, 140);
  assert.equal(order.estimate.total, 140);
  assert.equal(order.estimate.lines.find(line => line.id === 'part').approvalStatus, 'declined');
});

test('later work-order PUTs preserve the original approval, lock, decisions, and totals', () => {
  const originalRecorder = { id: 'staff-2', name: 'Service Writer', email: 'writer@example.test' };
  const existing = {
    ...existingOrder(),
    status: 'approved',
    total: 140,
    labor: 140,
    laborHours: 1,
    parts: 0,
    tax: 0,
    linesLockedAt: '2026-10-07T20:00:00.000Z',
    estimate: {
      ...existingOrder().estimate,
      total: 140,
      lines: [
        { ...existingOrder().estimate.lines[0], approvalStatus: 'approved' },
        { ...existingOrder().estimate.lines[1], approvalStatus: 'declined' },
      ],
    },
    estimateApproval: {
      ...otherApproval('Fleet manager email').estimateApproval,
      approvedAt: '2026-10-07T20:00:00.000Z',
      recordedBy: originalRecorder,
    },
  };
  const tampered = otherApproval('Changed method');
  tampered.status = 'in_progress';
  tampered.estimateApproval.recordedBy = { id: context.userId, name: context.name };
  tampered.estimateApproval.approvedAt = serverTimestamp;
  tampered.estimateApproval.decisions = { labor: 'declined', part: 'approved' };
  const order = validatedOrderApproval(tampered, context, existing, serverTimestamp);
  assert.deepEqual(order.estimateApproval.recordedBy, originalRecorder);
  assert.equal(order.estimateApproval.approvedAt, existing.estimateApproval.approvedAt);
  assert.deepEqual(order.estimateApproval.decisions, existing.estimateApproval.decisions);
  assert.equal(order.linesLockedAt, existing.linesLockedAt);
  assert.equal(order.total, existing.total);
  assert.equal(order.status, 'in_progress');
});

test('Worker rejects missing and whitespace-only Other labels', () => {
  for (const value of ['', '   ']) {
    assert.throws(
      () => validatedOrderApproval(otherApproval(value), context, existingOrder(), serverTimestamp),
      error => error.status === 400 && /Custom approval type is required/.test(error.message),
    );
  }
});

test('Worker rejects overlength Other labels', () => {
  assert.throws(
    () => validatedOrderApproval(
      otherApproval('x'.repeat(APPROVAL_CUSTOM_LABEL_MAX + 1)),
      context,
      existingOrder(),
      serverTimestamp,
    ),
    error => error.status === 400 && /characters or fewer/.test(error.message),
  );
});

test('Worker rejects stale, missing, or extra line decisions', () => {
  for (const decisions of [
    { labor: 'approved' },
    { labor: 'approved', part: 'declined', stale: 'approved' },
    { labor: 'approved', part: 'maybe' },
  ]) {
    const body = otherApproval('Fleet manager email');
    body.estimateApproval.decisions = decisions;
    assert.throws(
      () => validatedOrderApproval(body, context, existingOrder(), serverTimestamp),
      error => error.status === 400 && /estimate line|do not match/.test(error.message),
    );
  }
});

test('Worker restricts new approvals to owner, admin, and service writer roles', () => {
  for (const role of ['technician', 'office']) {
    assert.throws(
      () => validatedOrderApproval(
        otherApproval('Phone authorization'),
        { ...context, role },
        existingOrder(),
        serverTimestamp,
      ),
      error => error.status === 403 && /cannot record estimate approvals/.test(error.message),
    );
  }
  for (const role of ['owner', 'admin', 'service_writer']) {
    assert.equal(
      validatedOrderApproval(
        otherApproval('Phone authorization'),
        { ...context, role },
        existingOrder(),
        serverTimestamp,
      ).estimateApproval.recordedBy.id,
      context.userId,
    );
  }
});

test('Worker requires valid signature evidence and shop ownership', () => {
  const signatureBody = otherApproval('');
  signatureBody.estimateApproval = {
    status: 'approved',
    type: 'signature',
    authorizationName: 'Pat Customer',
    signedAt: '2026-10-07T21:44:00.000Z',
    signatureKey: 'shops/shop-1/signature/example.png',
    decisions: { labor: 'approved', part: 'approved' },
  };
  assert.equal(
    validatedOrderApproval(signatureBody, context, existingOrder(), serverTimestamp)
      .estimateApproval.signatureKey,
    signatureBody.estimateApproval.signatureKey,
  );
  assert.throws(
    () => validatedOrderApproval(
      { ...signatureBody, estimateApproval: { ...signatureBody.estimateApproval, signatureKey: '' } },
      context,
      existingOrder(),
      serverTimestamp,
    ),
    error => error.status === 400 && /stored signature/.test(error.message),
  );
  assert.throws(
    () => validatedOrderApproval(
      {
        ...signatureBody,
        estimateApproval: {
          ...signatureBody.estimateApproval,
          signatureKey: 'shops/another-shop/signature/example.png',
        },
      },
      context,
      existingOrder(),
      serverTimestamp,
    ),
    error => error.status === 400 && /does not belong/.test(error.message),
  );
});
