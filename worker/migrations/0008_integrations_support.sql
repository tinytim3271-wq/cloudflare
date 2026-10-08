PRAGMA foreign_keys = ON;

ALTER TABLE subscriptions ADD COLUMN created_at TEXT;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  verifier_ciphertext TEXT NOT NULL,
  verifier_iv TEXT NOT NULL,
  return_to TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS integration_sync_records (
  shop_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  local_id TEXT NOT NULL,
  remote_id TEXT NOT NULL,
  realm_id TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, provider, entity_type, local_id)
);

CREATE TABLE IF NOT EXISTS sms_consent (
  shop_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('opted_in', 'opted_out')),
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, phone)
);

CREATE TABLE IF NOT EXISTS customer_messages (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  customer_id TEXT,
  work_order_id TEXT,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  message_type TEXT NOT NULL DEFAULT 'message',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customer_messages_thread
  ON customer_messages(shop_id, phone, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_messages_provider_id
  ON customer_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  requester_email TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'urgent')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_shop_created
  ON support_tickets(shop_id, created_at DESC);
