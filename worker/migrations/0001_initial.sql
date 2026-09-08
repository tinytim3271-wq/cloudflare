PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  shop_id TEXT PRIMARY KEY,
  shop_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  credit_balance REAL NOT NULL DEFAULT 0,
  subscription_status TEXT NOT NULL DEFAULT 'active',
  subscription_expires_at TEXT,
  suspended INTEGER NOT NULL DEFAULT 0 CHECK (suspended IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  access_sub TEXT UNIQUE,
  shop_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'technician', 'office', 'service_writer')),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_shop ON users(shop_id, enabled);

CREATE TABLE IF NOT EXISTS entities (
  shop_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  data_json TEXT NOT NULL CHECK (json_valid(data_json)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_entities_list ON entities(shop_id, entity_type, updated_at);

CREATE TABLE IF NOT EXISTS integration_secrets (
  shop_id TEXT NOT NULL,
  secret_name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (shop_id, secret_name)
);

CREATE TABLE IF NOT EXISTS ai_rate_limits (
  shop_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL,
  PRIMARY KEY (shop_id, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  event_json TEXT NOT NULL CHECK (json_valid(event_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_shop_created ON audit_log(shop_id, created_at);
