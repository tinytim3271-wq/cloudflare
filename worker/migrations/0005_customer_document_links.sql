CREATE TABLE IF NOT EXISTS customer_document_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  shop_id TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('estimate', 'invoice')),
  document_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  result TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_document_links_document
  ON customer_document_links(shop_id, document_type, document_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_document_links_expiry
  ON customer_document_links(expires_at);
