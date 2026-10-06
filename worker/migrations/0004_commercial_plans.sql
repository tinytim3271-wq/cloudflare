-- Align commercial plans with the public SaaS pricing scheme.
-- Starter $49 · Shop $149 · Pro $299 · Enterprise custom

UPDATE plans
SET
  name = 'Starter',
  monthly_price_cents = 4900,
  max_users = 2,
  max_locations = 1,
  monthly_ai_requests = 2000,
  diagnostics_enabled = 0,
  payroll_enabled = 0,
  active = 1,
  stripe_price_id = COALESCE(NULLIF(stripe_price_id, ''), 'price_starter')
WHERE id = 'starter';

INSERT INTO plans (id, stripe_price_id, name, monthly_price_cents, max_users, max_locations, monthly_ai_requests, diagnostics_enabled, payroll_enabled, active)
VALUES ('shop', 'price_shop', 'Shop', 14900, 10, 3, 8000, 0, 0, 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  max_users = excluded.max_users,
  max_locations = excluded.max_locations,
  monthly_ai_requests = excluded.monthly_ai_requests,
  diagnostics_enabled = excluded.diagnostics_enabled,
  payroll_enabled = excluded.payroll_enabled,
  active = 1,
  stripe_price_id = COALESCE(NULLIF(plans.stripe_price_id, ''), excluded.stripe_price_id);

INSERT INTO plans (id, stripe_price_id, name, monthly_price_cents, max_users, max_locations, monthly_ai_requests, diagnostics_enabled, payroll_enabled, active)
VALUES ('pro', 'price_pro', 'Pro', 29900, 25, 10, 25000, 1, 1, 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  max_users = excluded.max_users,
  max_locations = excluded.max_locations,
  monthly_ai_requests = excluded.monthly_ai_requests,
  diagnostics_enabled = excluded.diagnostics_enabled,
  payroll_enabled = excluded.payroll_enabled,
  active = 1,
  stripe_price_id = COALESCE(NULLIF(plans.stripe_price_id, ''), excluded.stripe_price_id);

INSERT INTO plans (id, stripe_price_id, name, monthly_price_cents, max_users, max_locations, monthly_ai_requests, diagnostics_enabled, payroll_enabled, active)
VALUES ('enterprise', 'price_enterprise', 'Enterprise', 0, 100, 50, 100000, 1, 1, 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  max_users = excluded.max_users,
  max_locations = excluded.max_locations,
  monthly_ai_requests = excluded.monthly_ai_requests,
  diagnostics_enabled = excluded.diagnostics_enabled,
  payroll_enabled = excluded.payroll_enabled,
  active = 1,
  stripe_price_id = COALESCE(NULLIF(plans.stripe_price_id, ''), excluded.stripe_price_id);

-- Keep legacy Growth rows readable for existing subscriptions, but hide from new checkout.
UPDATE plans
SET active = 0, name = 'Growth (legacy)'
WHERE id = 'growth';
