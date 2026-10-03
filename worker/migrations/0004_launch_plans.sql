-- Launch catalog. Old starter/growth rows stay so existing subscription keys still resolve.
-- New Stripe prices are placeholders until live price IDs are created. Do not edit a live Stripe price in place.

ALTER TABLE plans ADD COLUMN ai_phone_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN overage_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN diagnostics_mode TEXT NOT NULL DEFAULT 'simulate';
ALTER TABLE plans ADD COLUMN annual_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN public INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plans ADD COLUMN founding INTEGER NOT NULL DEFAULT 0;

UPDATE plans
SET active = 0,
    public = 0,
    diagnostics_mode = CASE WHEN diagnostics_enabled = 1 THEN 'live' ELSE 'simulate' END
WHERE id IN ('starter', 'growth');

INSERT OR IGNORE INTO plans (
  id, stripe_price_id, name, monthly_price_cents, max_users, max_locations, monthly_ai_requests,
  diagnostics_enabled, payroll_enabled, active, ai_phone_minutes, overage_cents, diagnostics_mode,
  annual_price_cents, public, founding
) VALUES
  ('solo', 'price_solo', 'Solo', 6900, 0, 1, 0, 0, 1, 1, 200, 15, 'simulate', 69000, 1, 0),
  ('shop', 'price_shop', 'Shop', 13900, 0, 1, 0, 0, 1, 1, 800, 12, 'simulate', 139000, 1, 0),
  ('shop_pro', 'price_shop_pro', 'Shop Pro', 27900, 0, 1, 0, 1, 1, 1, 2500, 10, 'live', 279000, 1, 0),
  ('enterprise', 'price_enterprise', 'Enterprise', 55900, 0, 25, 0, 1, 1, 1, 10000, 8, 'live', 559000, 1, 0),
  ('founding_solo', 'price_founding_solo', 'Founding Solo', 4900, 0, 1, 0, 0, 1, 1, 200, 15, 'simulate', 49000, 0, 1),
  ('founding_shop', 'price_founding_shop', 'Founding Shop', 9900, 0, 1, 0, 0, 1, 1, 800, 12, 'simulate', 99000, 0, 1),
  ('founding_pro', 'price_founding_pro', 'Founding Pro', 19900, 0, 1, 0, 1, 1, 1, 2500, 10, 'live', 199000, 0, 1);

CREATE TABLE IF NOT EXISTS founding_invites (
  token TEXT PRIMARY KEY,
  issued_to TEXT,
  issued_at TEXT NOT NULL,
  used_at TEXT,
  used_by_shop_id TEXT,
  plan_id TEXT
);

CREATE TABLE IF NOT EXISTS founding_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  claimed INTEGER NOT NULL DEFAULT 0,
  cap INTEGER NOT NULL DEFAULT 50
);

INSERT OR IGNORE INTO founding_counter (id, claimed, cap) VALUES (1, 0, 50);
