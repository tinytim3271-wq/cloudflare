import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVAL_CUSTOM_LABEL_MAX,
  approvalSummary,
  normalizeEstimateApproval,
  validateEstimateApproval,
} from './estimate-approval.js';

const recordedBy = { id: 'staff-1', name: 'Timothy Alderman', email: 'timothy@example.test' };

test('legacy signed approvals normalize to signature approvals', () => {
  const approval = normalizeEstimateApproval({
    status: 'approved',
    authorizationName: 'Pat Customer',
    signedAt: '2026-10-07T18:30:00.000Z',
    signatureKey: 'shops/shop-1/signatures/example.png',
  });
  assert.equal(approval.type, 'signature');
  assert.equal(approval.approvedAt, approval.signedAt);
});

test('phone approval validates and produces an audit-friendly summary', () => {
  const approval = validateEstimateApproval({
    status: 'approved',
    type: 'phone',
    authorizationName: 'Pat Customer',
    approvedAt: '2026-10-07T18:30:00.000Z',
    recordedBy,
    note: 'Called from the number on file',
  });
  assert.match(
    approvalSummary(approval, () => 'Oct 7, 2026, 6:30 PM'),
    /Approved by phone — Pat Customer \(Called from the number on file\), Oct 7, 2026, 6:30 PM, recorded by Timothy Alderman/,
  );
});

test('Other requires a trimmed custom approval label', () => {
  assert.throws(
    () => validateEstimateApproval({
      status: 'approved',
      type: 'other',
      customLabel: '   ',
      authorizationName: 'Fleet Manager',
      approvedAt: '2026-10-07T18:30:00.000Z',
      recordedBy,
    }),
    /Custom approval type is required/,
  );

  const approval = validateEstimateApproval({
    status: 'approved',
    type: 'other',
    customLabel: '  Approved via fleet manager email  ',
    authorizationName: 'Dana Fleet',
    approvedAt: '2026-10-07T18:30:00.000Z',
    recordedBy,
  });
  assert.equal(approval.customLabel, 'Approved via fleet manager email');
  assert.match(approvalSummary(approval, () => 'now'), /^Approved: Approved via fleet manager email/);
});

test('Other rejects labels beyond the server limit instead of truncating them silently', () => {
  assert.throws(
    () => validateEstimateApproval({
      status: 'approved',
      type: 'other',
      customLabel: 'x'.repeat(APPROVAL_CUSTOM_LABEL_MAX + 1),
      authorizationName: 'Fleet Manager',
      approvedAt: '2026-10-07T18:30:00.000Z',
      recordedBy,
    }),
    new RegExp(`${APPROVAL_CUSTOM_LABEL_MAX} characters or fewer`),
  );
});
