import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPendingFoundingClaim, claimBatchOutcome } from '../src/founding.mjs';

test('claimBatchOutcome requires both invite and counter updates', () => {
  assert.deepEqual(claimBatchOutcome(true, true), {
    ok: true,
    restoreInvite: false,
    decrementCounter: false,
  });
  assert.deepEqual(claimBatchOutcome(true, false), {
    ok: false,
    restoreInvite: true,
    decrementCounter: false,
  });
  assert.deepEqual(claimBatchOutcome(false, true), {
    ok: false,
    restoreInvite: false,
    decrementCounter: true,
  });
  assert.deepEqual(claimBatchOutcome(false, false), {
    ok: false,
    restoreInvite: false,
    decrementCounter: false,
  });
});

function memoryFoundingDb({ invite } = {}) {
  const state = {
    invite: invite ? { ...invite } : null,
    accounts: [],
    subscriptions: [],
    shops: [],
    statements: [],
  };

  function bindable(sql) {
    return {
      bind(...args) {
        return {
          async first() {
            if (/FROM founding_invites/i.test(sql) && /lower\(trim\(used_by_shop_id\)\)/i.test(sql)) {
              const email = String(args[0] || '').toLowerCase();
              if (
                state.invite
                && state.invite.used_at
                && state.invite.plan_id
                && String(state.invite.used_by_shop_id || '').toLowerCase() === email
              ) {
                return { token: state.invite.token, plan_id: state.invite.plan_id };
              }
              return null;
            }
            return null;
          },
          async run() {
            state.statements.push({ sql, args });
            return { success: true, meta: { changes: 1 } };
          },
        };
      },
    };
  }

  return {
    state,
    DB: {
      prepare(sql) {
        return bindable(sql);
      },
      async batch(statements) {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        // Mirror production side effects for assertions.
        for (const { sql, args } of state.statements.slice(-statements.length)) {
          if (/INSERT INTO accounts/i.test(sql)) {
            state.accounts.push({
              shop_id: args[0],
              shop_name: args[1],
              owner_email: args[2],
              owner_name: args[3],
              subscription_status: 'trialing',
              subscription_expires_at: args[4],
            });
          }
          if (/INSERT INTO subscriptions/i.test(sql)) {
            state.subscriptions.push({
              shop_id: args[0],
              plan_id: args[1],
              status: 'trialing',
              current_period_end: args[2],
            });
          }
          if (/UPDATE shops SET billing_status/i.test(sql)) {
            state.shops.push({ id: args[1], billing_status: 'trialing' });
          }
          if (/UPDATE founding_invites/i.test(sql) && /used_by_shop_id = \?/i.test(sql)) {
            if (state.invite && state.invite.token === args[1]) {
              state.invite.used_by_shop_id = args[0];
            }
          }
        }
        return results;
      },
    },
  };
}

test('applyPendingFoundingClaim attaches the reserved plan and rewrites used_by_shop_id', async () => {
  const { DB, state } = memoryFoundingDb({
    invite: {
      token: 'invite-1',
      plan_id: 'founding_pro',
      used_at: '2026-10-01T11:00:00.000Z',
      used_by_shop_id: 'owner@shop.test',
    },
  });

  const result = await applyPendingFoundingClaim({ DB }, {
    email: 'Owner@Shop.Test',
    shopId: 'shop-abc',
    ownerName: 'Lee',
    shopName: "Lee's shop",
  });

  assert.deepEqual(result, {
    planId: 'founding_pro',
    token: 'invite-1',
    shopId: 'shop-abc',
    trialEnds: result.trialEnds,
  });
  assert.match(result.trialEnds, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0].shop_id, 'shop-abc');
  assert.equal(state.accounts[0].owner_email, 'owner@shop.test');
  assert.equal(state.accounts[0].subscription_status, 'trialing');
  assert.equal(state.subscriptions[0].plan_id, 'founding_pro');
  assert.equal(state.invite.used_by_shop_id, 'shop-abc');
});

test('applyPendingFoundingClaim is a no-op without a pending email-linked invite', async () => {
  const { DB, state } = memoryFoundingDb({
    invite: {
      token: 'invite-2',
      plan_id: 'founding_shop',
      used_at: '2026-10-01T11:00:00.000Z',
      used_by_shop_id: 'shop-already-applied',
    },
  });

  const result = await applyPendingFoundingClaim({ DB }, {
    email: 'owner@shop.test',
    shopId: 'shop-abc',
  });

  assert.equal(result, null);
  assert.equal(state.accounts.length, 0);
  assert.equal(state.subscriptions.length, 0);
});

test('applyPendingFoundingClaim is a no-op when the optional founding schema is not installed', async (t) => {
  const warnings = t.mock.method(console, 'warn', () => {});
  const DB = {
    prepare(sql) {
      assert.match(sql, /FROM founding_invites/i);
      return {
        bind() {
          return {
            async first() {
              throw new Error('D1_ERROR: no such table: founding_invites: SQLITE_ERROR');
            },
          };
        },
      };
    },
  };

  const result = await applyPendingFoundingClaim({ DB }, {
    email: 'owner@shop.test',
    shopId: 'shop-abc',
  });

  assert.equal(result, null);
  assert.equal(warnings.mock.callCount(), 1);
  assert.doesNotMatch(warnings.mock.calls[0].arguments[0], /owner@shop\.test/);
});

test('applyPendingFoundingClaim does not hide unrelated database failures', async () => {
  const DB = {
    prepare() {
      return {
        bind() {
          return {
            async first() {
              throw new Error('D1_ERROR: database is locked: SQLITE_BUSY');
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    applyPendingFoundingClaim({ DB }, { email: 'owner@shop.test', shopId: 'shop-abc' }),
    /database is locked/,
  );
});
