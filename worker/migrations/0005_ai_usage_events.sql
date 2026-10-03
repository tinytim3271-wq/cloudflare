CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  user_id TEXT,
  channel TEXT NOT NULL CHECK (channel IN ('text', 'voice')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  voice_seconds REAL NOT NULL DEFAULT 0 CHECK (voice_seconds >= 0),
  provider_cost_usd REAL,
  billed_usd REAL,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_shop_created
  ON ai_usage_events(shop_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created
  ON ai_usage_events(created_at);
