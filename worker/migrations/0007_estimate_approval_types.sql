-- Approval metadata remains in the work-order JSON so entity sync stays
-- backward compatible. Backfill existing signed approvals with the new
-- explicit type and canonical approval timestamp.
UPDATE entities
SET data_json = json_set(
  data_json,
  '$.estimateApproval.type', 'signature',
  '$.estimateApproval.approvedAt',
  COALESCE(
    json_extract(data_json, '$.estimateApproval.approvedAt'),
    json_extract(data_json, '$.estimateApproval.signedAt'),
    updated_at
  )
)
WHERE entity_type = 'orders'
  AND json_extract(data_json, '$.estimateApproval.status') = 'approved'
  AND COALESCE(json_extract(data_json, '$.estimateApproval.type'), '') = ''
  AND (
    COALESCE(json_extract(data_json, '$.estimateApproval.signatureKey'), '') != ''
    OR COALESCE(json_extract(data_json, '$.estimateApproval.signatureDataUrl'), '') != ''
    OR COALESCE(json_extract(data_json, '$.estimateApproval.signedAt'), '') != ''
  );
