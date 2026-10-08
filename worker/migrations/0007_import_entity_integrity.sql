-- Normalize historical imported JSON into the canonical fields used by the
-- Pages application. Tenant ownership remains in the entities.shop_id column.

UPDATE entities
SET data_json = json_set(
  data_json,
  '$.name', COALESCE(NULLIF(json_extract(data_json, '$.name'), ''), json_extract(data_json, '$.customer_name')),
  '$.phone', COALESCE(NULLIF(json_extract(data_json, '$.phone'), ''), json_extract(data_json, '$.mobile'), ''),
  '$.billingAddress', COALESCE(NULLIF(json_extract(data_json, '$.billingAddress'), ''), json_extract(data_json, '$.billing_address'), json_extract(data_json, '$.address'), ''),
  '$.billingNotes', COALESCE(NULLIF(json_extract(data_json, '$.billingNotes'), ''), json_extract(data_json, '$.billing_notes'), json_extract(data_json, '$.notes'), '')
)
WHERE entity_type = 'customers'
  AND (
    json_type(data_json, '$.customer_name') IS NOT NULL
    OR json_type(data_json, '$.mobile') IS NOT NULL
    OR json_type(data_json, '$.billing_address') IS NOT NULL
    OR json_type(data_json, '$.address') IS NOT NULL
    OR json_type(data_json, '$.billing_notes') IS NOT NULL
  );

UPDATE entities
SET data_json = json_set(
  data_json,
  '$.customer', COALESCE(NULLIF(json_extract(data_json, '$.customer'), ''), json_extract(data_json, '$.customer_name'), json_extract(data_json, '$.owner')),
  '$.year', COALESCE(NULLIF(json_extract(data_json, '$.year'), ''), json_extract(data_json, '$.vehicle_year')),
  '$.make', COALESCE(NULLIF(json_extract(data_json, '$.make'), ''), json_extract(data_json, '$.vehicle_make')),
  '$.model', COALESCE(NULLIF(json_extract(data_json, '$.model'), ''), json_extract(data_json, '$.vehicle_model')),
  '$.vin', COALESCE(NULLIF(json_extract(data_json, '$.vin'), ''), json_extract(data_json, '$.vehicle_vin'), ''),
  '$.plate', COALESCE(NULLIF(json_extract(data_json, '$.plate'), ''), json_extract(data_json, '$.license_plate'), json_extract(data_json, '$.reg_num'), '')
)
WHERE entity_type = 'vehicles';

UPDATE entities
SET data_json = json_set(
  data_json,
  '$.date', COALESCE(NULLIF(json_extract(data_json, '$.date'), ''), json_extract(data_json, '$.expense_date'), json_extract(data_json, '$.paid_date')),
  '$.vendor', COALESCE(NULLIF(json_extract(data_json, '$.vendor'), ''), json_extract(data_json, '$.payee')),
  '$.category', COALESCE(NULLIF(json_extract(data_json, '$.category'), ''), json_extract(data_json, '$.expense_category'), 'Uncategorized'),
  '$.memo', COALESCE(NULLIF(json_extract(data_json, '$.memo'), ''), json_extract(data_json, '$.description'), json_extract(data_json, '$.notes'), ''),
  '$.amount', COALESCE(json_extract(data_json, '$.amount'), json_extract(data_json, '$.total_amount'), json_extract(data_json, '$.total'))
)
WHERE entity_type = 'expenses';

UPDATE entities
SET data_json = json_set(
  data_json,
  '$.number', COALESCE(NULLIF(json_extract(data_json, '$.number'), ''), json_extract(data_json, '$.invoice_number'), json_extract(data_json, '$.invoice'), entity_id),
  '$.customer', COALESCE(NULLIF(json_extract(data_json, '$.customer'), ''), json_extract(data_json, '$.customer_name')),
  '$.ro', COALESCE(NULLIF(json_extract(data_json, '$.ro'), ''), json_extract(data_json, '$.ro_number'), json_extract(data_json, '$.work_order'), ''),
  '$.date', COALESCE(NULLIF(json_extract(data_json, '$.date'), ''), json_extract(data_json, '$.invoice_date'), substr(created_at, 1, 10)),
  '$.due', COALESCE(NULLIF(json_extract(data_json, '$.due'), ''), json_extract(data_json, '$.due_date'), ''),
  '$.amount', COALESCE(json_extract(data_json, '$.amount'), json_extract(data_json, '$.total_amount'), json_extract(data_json, '$.total')),
  '$.status', CASE lower(replace(replace(COALESCE(json_extract(data_json, '$.status'), 'sent'), ' ', '_'), '-', '_'))
    WHEN 'closed' THEN 'paid'
    WHEN 'complete' THEN 'paid'
    WHEN 'completed' THEN 'paid'
    WHEN 'past_due' THEN 'overdue'
    WHEN 'open' THEN 'sent'
    WHEN 'unpaid' THEN 'sent'
    ELSE lower(replace(replace(COALESCE(json_extract(data_json, '$.status'), 'sent'), ' ', '_'), '-', '_'))
  END,
  '$.closedAt', COALESCE(
    NULLIF(json_extract(data_json, '$.closedAt'), ''),
    NULLIF(json_extract(data_json, '$.closeoutDate'), ''),
    NULLIF(json_extract(data_json, '$.closeout_date'), ''),
    NULLIF(json_extract(data_json, '$.closed_at'), ''),
    NULLIF(json_extract(data_json, '$.closed_date'), ''),
    NULLIF(json_extract(data_json, '$.paidAt'), ''),
    NULLIF(json_extract(data_json, '$.paid_at'), ''),
    NULLIF(json_extract(data_json, '$.paid_date'), ''),
    NULLIF(json_extract(data_json, '$.completedAt'), ''),
    NULLIF(json_extract(data_json, '$.completed_at'), ''),
    NULLIF(json_extract(data_json, '$.completed_date'), ''),
    NULLIF(json_extract(data_json, '$.date'), ''),
    NULLIF(json_extract(data_json, '$.invoice_date'), ''),
    substr(created_at, 1, 10)
  ),
  '$.closeoutSource', COALESCE(
    NULLIF(json_extract(data_json, '$.closeoutSource'), ''),
    CASE
      WHEN COALESCE(
        NULLIF(json_extract(data_json, '$.closeoutDate'), ''),
        NULLIF(json_extract(data_json, '$.closeout_date'), ''),
        NULLIF(json_extract(data_json, '$.closed_at'), ''),
        NULLIF(json_extract(data_json, '$.closed_date'), ''),
        NULLIF(json_extract(data_json, '$.paidAt'), ''),
        NULLIF(json_extract(data_json, '$.paid_at'), ''),
        NULLIF(json_extract(data_json, '$.paid_date'), ''),
        NULLIF(json_extract(data_json, '$.completedAt'), ''),
        NULLIF(json_extract(data_json, '$.completed_at'), ''),
        NULLIF(json_extract(data_json, '$.completed_date'), '')
      ) IS NOT NULL THEN 'source_closeout_date'
      WHEN COALESCE(NULLIF(json_extract(data_json, '$.date'), ''), NULLIF(json_extract(data_json, '$.invoice_date'), '')) IS NOT NULL THEN 'invoice_date'
      ELSE 'record_created_at'
    END
  )
)
WHERE entity_type = 'invoices';
