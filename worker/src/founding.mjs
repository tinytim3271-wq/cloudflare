import { isFoundingPlan } from './plans.mjs';

const FOUNDING_TRIAL_DAYS = 14;

function missingFoundingSchema(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*(?:main\.)?founding_invites\b/i.test(message);
}

/**
 * Interpret the two-statement founding claim batch.
 * Partial success must be compensated so invites are not burned without a
 * counter slot (and counters are not inflated without a used invite).
 */
export function claimBatchOutcome(inviteUpdated, counterUpdated) {
  if (inviteUpdated && counterUpdated) return { ok: true, restoreInvite: false, decrementCounter: false };
  return {
    ok: false,
    restoreInvite: Boolean(inviteUpdated && !counterUpdated),
    decrementCounter: Boolean(counterUpdated && !inviteUpdated),
  };
}

/**
 * After `/api/founding/claim` stores the owner email in `used_by_shop_id`,
 * attach the reserved founding plan when that email's shop is created/signed in.
 * Without this step the invite is consumed but entitlement/subscription never
 * receive the founding plan_id.
 */
export async function applyPendingFoundingClaim(env, { email, shopId, ownerName, shopName } = {}) {
  const normalized = String(email || '').trim().toLowerCase();
  const targetShopId = String(shopId || '').trim();
  if (!normalized || !targetShopId) return null;

  let invite;
  try {
    invite = await env.DB.prepare(`
      SELECT token, plan_id
      FROM founding_invites
      WHERE used_at IS NOT NULL
        AND plan_id IS NOT NULL
        AND lower(trim(used_by_shop_id)) = ?
      LIMIT 1
    `).bind(normalized).first();
  } catch (error) {
    if (!missingFoundingSchema(error)) throw error;
    console.warn(JSON.stringify({
      message: 'optional founding schema unavailable',
      feature: 'founding_claim',
      table: 'founding_invites',
    }));
    return null;
  }

  const planId = String(invite?.plan_id || '').trim();
  if (!invite?.token || !isFoundingPlan(planId)) return null;

  const now = new Date();
  const nowIso = now.toISOString();
  const trialEnds = new Date(now.getTime() + FOUNDING_TRIAL_DAYS * 86400000).toISOString();
  const owner = String(ownerName || normalized.split('@')[0] || 'Owner').trim();
  const displayName = String(shopName || `${owner}'s shop`).trim();

  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO accounts (
        shop_id, shop_name, owner_email, owner_name,
        subscription_status, subscription_expires_at, created_at, updated_at, created_by
      )
      VALUES (?, ?, ?, ?, 'trialing', ?, ?, ?, ?)
      ON CONFLICT(shop_id) DO UPDATE SET
        subscription_status = 'trialing',
        subscription_expires_at = COALESCE(accounts.subscription_expires_at, excluded.subscription_expires_at),
        updated_at = excluded.updated_at
    `).bind(targetShopId, displayName, normalized, owner, trialEnds, nowIso, nowIso, normalized),
    env.DB.prepare(`
      INSERT INTO subscriptions (shop_id, plan_id, status, current_period_end, created_at, updated_at)
      VALUES (?, ?, 'trialing', ?, ?, ?)
      ON CONFLICT(shop_id) DO UPDATE SET
        plan_id = excluded.plan_id,
        status = excluded.status,
        current_period_end = excluded.current_period_end,
        updated_at = excluded.updated_at
    `).bind(targetShopId, planId, trialEnds, nowIso, nowIso),
    env.DB.prepare(`
      UPDATE shops SET billing_status = 'trialing', updated_at = ? WHERE id = ?
    `).bind(nowIso, targetShopId),
    env.DB.prepare(`
      UPDATE founding_invites
      SET used_by_shop_id = ?
      WHERE token = ? AND lower(trim(used_by_shop_id)) = ?
    `).bind(targetShopId, invite.token, normalized),
  ]);

  return { planId, token: invite.token, shopId: targetShopId, trialEnds };
}
