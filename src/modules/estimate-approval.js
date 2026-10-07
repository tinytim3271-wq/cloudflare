export const APPROVAL_CUSTOM_LABEL_MAX = 120;
export const APPROVAL_NOTE_MAX = 300;

export const ESTIMATE_APPROVAL_TYPES = Object.freeze([
  { value: 'signature', label: 'Signature' },
  { value: 'phone', label: 'Phone approval' },
  { value: 'in_person', label: 'In-person approval' },
  { value: 'email', label: 'Email approval' },
  { value: 'text', label: 'Text approval' },
  { value: 'other', label: 'Other' },
]);

const APPROVAL_TYPE_VALUES = new Set(ESTIMATE_APPROVAL_TYPES.map(option => option.value));

const trimmed = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

export function approvalRecorder(user = {}) {
  return {
    id: String(user.id || user.userId || '').trim(),
    name: String(user.name || user.email || 'Staff member').trim(),
    email: String(user.email || '').trim().toLowerCase(),
  };
}

export function normalizeEstimateApproval(approval) {
  if (!approval || typeof approval !== 'object') return approval || null;
  if (approval.status !== 'approved') return { ...approval };
  const inferredType = approval.type || 'signature';
  return {
    ...approval,
    type: String(inferredType).trim().toLowerCase(),
    customLabel: trimmed(approval.customLabel, APPROVAL_CUSTOM_LABEL_MAX),
    authorizationName: trimmed(approval.authorizationName, 100),
    approvedAt: String(approval.approvedAt || approval.signedAt || '').trim(),
    note: trimmed(approval.note, APPROVAL_NOTE_MAX),
    recordedBy: approval.recordedBy && typeof approval.recordedBy === 'object'
      ? approvalRecorder(approval.recordedBy)
      : approval.recordedBy ? approvalRecorder({ name: approval.recordedBy }) : null,
  };
}

export function validateEstimateApproval(approval) {
  const normalized = normalizeEstimateApproval(approval);
  if (!normalized || normalized.status !== 'approved') return normalized;
  if (!APPROVAL_TYPE_VALUES.has(normalized.type)) {
    throw new Error('Choose a valid estimate approval type');
  }
  if (normalized.type !== 'signature' && !normalized.authorizationName) {
    throw new Error('Approver name is required');
  }
  if (normalized.type === 'other' && !normalized.customLabel) {
    throw new Error('Custom approval type is required when Other is selected');
  }
  if (String(approval?.customLabel || '').trim().length > APPROVAL_CUSTOM_LABEL_MAX) {
    throw new Error(`Custom approval type must be ${APPROVAL_CUSTOM_LABEL_MAX} characters or fewer`);
  }
  if (String(approval?.note || '').trim().length > APPROVAL_NOTE_MAX) {
    throw new Error(`Approval note must be ${APPROVAL_NOTE_MAX} characters or fewer`);
  }
  if (!normalized.approvedAt || !Number.isFinite(Date.parse(normalized.approvedAt))) {
    throw new Error('Approval timestamp is required');
  }
  if (normalized.type !== 'signature' && !normalized.recordedBy?.name) {
    throw new Error('The staff member recording this approval is required');
  }
  return normalized;
}

export function approvalTypeLabel(approval) {
  const normalized = normalizeEstimateApproval(approval);
  if (!normalized) return '';
  if (normalized.type === 'other') return normalized.customLabel || 'Other';
  return ESTIMATE_APPROVAL_TYPES.find(option => option.value === normalized.type)?.label || 'Signature';
}

export function approvalSummary(approval, formatDate = value => new Date(value).toLocaleString()) {
  const normalized = normalizeEstimateApproval(approval);
  if (!normalized || normalized.status !== 'approved') return '';
  const when = normalized.approvedAt ? formatDate(normalized.approvedAt) : '';
  if (normalized.type === 'signature') {
    return [`Signed by ${normalized.authorizationName || 'customer'}`, when].filter(Boolean).join(' — ');
  }
  const method = normalized.type === 'other'
    ? `Approved: ${normalized.customLabel || 'Other'}`
    : `Approved by ${approvalTypeLabel(normalized).replace(/ approval$/i, '').toLowerCase()}`;
  const approver = normalized.authorizationName ? ` — ${normalized.authorizationName}` : '';
  const note = normalized.note ? ` (${normalized.note})` : '';
  const recorder = normalized.recordedBy?.name ? `recorded by ${normalized.recordedBy.name}` : '';
  return [`${method}${approver}${note}`, when, recorder].filter(Boolean).join(', ');
}
