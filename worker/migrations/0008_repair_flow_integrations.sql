-- Repair-flow integration support: OAuth state + idempotent QuickBooks sync log.
-- Per-shop credentials continue to use integration_secrets (AES-GCM).

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(meta_json))
);
CREATE INDEX IF NOT EXISTS idx_oauth_states_shop ON oauth_states(shop_id, provider);
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS integration_sync_log (
  shop_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  local_id TEXT NOT NULL,
  remote_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  payload_hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('synced', 'error', 'pending')),
  last_error TEXT,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, provider, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_integration_sync_local
  ON integration_sync_log(shop_id, provider, entity_type, local_id);
