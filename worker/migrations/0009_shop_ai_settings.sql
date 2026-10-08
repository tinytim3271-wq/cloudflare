-- Per-shop AI provider settings: optional "bring your own Anthropic key" upgrade.
-- The key is AES-GCM encrypted with the existing INTEGRATION_ENCRYPTION_KEY Worker
-- secret; only the last 4 characters are stored in clear for the masked display.
-- Shops without a row use the included Cloudflare Workers AI.

CREATE TABLE IF NOT EXISTS shop_ai_settings (
  shop_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic')),
  key_ciphertext TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_last4 TEXT NOT NULL DEFAULT '',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  last_error TEXT,
  last_error_at TEXT,
  validated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
