import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportTicket, normalizeSupportTicket } from '../src/support.mjs';

const context = { shopId: 'shop-1', userId: 'user-1', email: 'owner@example.com' };

test('support tickets validate and bound customer input', () => {
  const ticket = normalizeSupportTicket({
    category: 'data_migration',
    priority: 'urgent',
    subject: 'Import blocked',
    description: 'ARI customer rows fail validation.',
  }, context);
  assert.equal(ticket.requesterEmail, context.email);
  assert.equal(ticket.category, 'data_migration');
  assert.equal(ticket.priority, 'urgent');
  assert.throws(
    () => normalizeSupportTicket({ subject: 'Missing description' }, context),
    /Subject and description are required/,
  );
});

test('ticket persists when email notification is not configured', async () => {
  let values;
  const env = {
    DB: {
      prepare() {
        return {
          bind(...bound) {
            values = bound;
            return { run: async () => ({ meta: { changes: 1 } }) };
          },
        };
      },
    },
  };
  const ticket = await createSupportTicket(env, context, {
    category: 'technical',
    priority: 'normal',
    subject: 'Cannot open an estimate',
    description: 'The estimate button returns an error.',
  });
  assert.match(ticket.id, /^SUP-/);
  assert.equal(ticket.notification, 'not_configured');
  assert.equal(values[1], 'shop-1');
  assert.equal(values[4], 'technical');
});
