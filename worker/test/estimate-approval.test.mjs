import test from 'node:test';
import assert from 'node:assert/strict';
import { APPROVAL_CUSTOM_LABEL_MAX } from '../../src/modules/estimate-approval.js';
import { putEntity, validatedOrderApproval, verifyOrderApprovalSignature } from '../src/index.js';

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
  const laterEditor = {
    ...context,
    userId: 'tech-9',
    name: 'Different Technician',
    email: 'tech@example.test',
    role: 'technician',
  };
  const order = validatedOrderApproval(tampered, laterEditor, existing, serverTimestamp);
  assert.deepEqual(order.estimateApproval.recordedBy, originalRecorder);
  assert.equal(order.estimateApproval.approvedAt, existing.estimateApproval.approvedAt);
  assert.deepEqual(order.estimateApproval.decisions, existing.estimateApproval.decisions);
  assert.equal(order.linesLockedAt, existing.linesLockedAt);
  assert.equal(order.total, existing.total);
  assert.equal(order.status, 'in_progress');
});

test('an explicit estimate revision may clear approval before a fresh authorization', () => {
  const existing = {
    ...existingOrder(),
    status: 'approved',
    linesLockedAt: '2026-10-07T20:00:00.000Z',
    estimateApproval: {
      ...otherApproval('Fleet manager email').estimateApproval,
      approvedAt: '2026-10-07T20:00:00.000Z',
    },
  };
  const revision = {
    ...existing,
    estimateApproval: null,
    linesLockedAt: null,
    estimateRevisionPending: true,
  };
  const order = validatedOrderApproval(revision, context, existing, serverTimestamp);
  assert.equal(order.estimateApproval, null);
  assert.equal(order.linesLockedAt, null);
  assert.equal(order.estimateRevisionPending, true);
});

test('technicians and office staff cannot clear an existing approval as a revision', () => {
  const existing = {
    ...existingOrder(),
    linesLockedAt: '2026-10-07T20:00:00.000Z',
    estimateApproval: {
      ...otherApproval('Fleet manager email').estimateApproval,
      approvedAt: '2026-10-07T20:00:00.000Z',
    },
  };
  const revision = {
    ...existing,
    estimateApproval: null,
    linesLockedAt: null,
    estimateRevisionPending: true,
  };
  for (const role of ['technician', 'office']) {
    assert.throws(
      () => validatedOrderApproval(revision, { ...context, role }, existing, serverTimestamp),
      error => error.status === 403 && /cannot revise/.test(error.message),
    );
  }
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

test('Worker verifies a referenced signature exists in R2 and is a PNG', async () => {
  const signature = {
    status: 'approved',
    type: 'signature',
    signatureKey: 'shops/shop-1/signature/example.png',
  };
  await verifyOrderApprovalSignature({
    FILES: {
      async head(key) {
        assert.equal(key, signature.signatureKey);
        return { httpMetadata: { contentType: 'image/png' } };
      },
    },
  }, context, signature);
  await assert.rejects(
    () => verifyOrderApprovalSignature({ FILES: { async head() { return null; } } }, context, signature),
    error => error.status === 400 && /not found/.test(error.message),
  );
  await assert.rejects(
    () => verifyOrderApprovalSignature({
      FILES: { async head() { return { httpMetadata: { contentType: 'image/jpeg' } }; } },
    }, context, signature),
    error => error.status === 400 && /PNG/.test(error.message),
  );
});

test('the D1 approval write guard allows only one concurrent approval to commit', async () => {
  let locked = false;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                return {
                  created_at: '2026-10-07T19:00:00.000Z',
                  created_by: 'staff-1',
                  updated_at: '2026-10-07T19:00:00.000Z',
                };
              },
              async run() {
                assert.match(sql, /json_extract\(data_json, '\$\.estimateApproval\.status'\)/);
                if (locked) return { meta: { changes: 0 } };
                locked = true;
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
  const options = { requireUnlockedEstimate: true };
  const outcomes = await Promise.allSettled([
    putEntity(env, context, 'orders', 'RO-1200', otherApproval('Phone'), null, context.userId, options),
    putEntity(env, context, 'orders', 'RO-1200', otherApproval('In person'), null, context.userId, options),
  ]);
  assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
  const rejection = outcomes.find(outcome => outcome.status === 'rejected');
  assert.equal(rejection.reason.status, 409);
});
