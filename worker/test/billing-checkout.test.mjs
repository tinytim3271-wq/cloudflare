import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin = 'https://app.example.test';

function checkoutRequest({ successUrl, cancelUrl } = {}) {
  return new Request(`${origin}/api/billing/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-MechPro-Dev-Email': 'owner@example.test',
    },
    body: JSON.stringify({ planId: 'shop', successUrl, cancelUrl }),
  });
}

function billingDb() {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              if (/SELECT shop_id, role, name, enabled FROM users/.test(sql)) {
                return { shop_id: 'shop-1', role: 'admin', name: 'Owner', enabled: 1 };
              }
              if (/SELECT \* FROM plans/.test(sql)) {
                return { id: 'shop', active: 1, public: 1, founding: 0 };
              }
              if (/SELECT stripe_customer_id FROM billing_customers/.test(sql)) return null;
              return null;
            },
            async run() {
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const env = {
  DB: billingDb(),
  DEV_AUTH_BYPASS: '1',
  STRIPE_SECRET_KEY: 'stripe-test-key',
  STRIPE_PRICE_SHOP_MONTHLY: 'price_1ABC123xyz',
};

test('billing checkout rejects redirects outside the request origin', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('Stripe must not be called for invalid redirect URLs');
  };

  try {
    for (const body of [
      { successUrl: 'https://attacker.example/paid', cancelUrl: `${origin}/?billing=cancelled` },
      { successUrl: `${origin}/?billing=success`, cancelUrl: 'https://attacker.example/cancelled' },
    ]) {
      const response = await worker.fetch(checkoutRequest(body), env);
      assert.equal(response.status, 400);
    }
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('billing checkout accepts same-origin redirect URLs', async () => {
  const originalFetch = globalThis.fetch;
  const stripeRequests = [];
  globalThis.fetch = async (url, options) => {
    stripeRequests.push({ url, options });
    return stripeRequests.length === 1
      ? Response.json({ id: 'cus_test' })
      : Response.json({ url: 'https://checkout.stripe.test/session' });
  };

  try {
    const successUrl = `${origin}/?billing=success`;
    const cancelUrl = `${origin}/?billing=cancelled`;
    const response = await worker.fetch(checkoutRequest({ successUrl, cancelUrl }), env);
    assert.equal(response.status, 200);
    assert.equal(stripeRequests.length, 2);
    const params = new URLSearchParams(stripeRequests[1].options.body);
    assert.equal(params.get('success_url'), successUrl);
    assert.equal(params.get('cancel_url'), cancelUrl);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
