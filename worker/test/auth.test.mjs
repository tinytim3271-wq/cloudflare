import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function signInRequest(email = 'owner@example.test') {
  return new Request('https://app.example.test/api/auth/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, returnTo: '/' }),
  });
}

function mockLoginDb() {
  let token = null;
  return {
    get token() { return token; },
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              assert.match(sql, /SELECT created_at FROM login_tokens/);
              return token;
            },
            async run() {
              assert.match(sql, /INSERT INTO login_tokens/);
              token = { token_hash: args[2], created_at: args[5] };
            },
          };
        },
      };
    },
  };
}

test('missing email configuration rejects repeated requests without touching the database', async (t) => {
  const errors = t.mock.method(console, 'error', () => {});
  const env = {
    DB: {
      prepare() { assert.fail('Unconfigured email must not read or store login tokens'); },
    },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await worker.fetch(signInRequest(), env);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.match(payload.message, /AUTH_EMAIL_WEBHOOK/);
    assert.equal(payload.loginUrl, undefined);
    assert.equal(payload.sent, undefined);
  }
  assert.equal(errors.mock.callCount(), 2);
});

test('invalid email is rejected before checking email configuration', async (t) => {
  t.mock.method(console, 'error', () => {});
  const response = await worker.fetch(signInRequest('invalid'), {});
  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, 'Enter a valid email address');
});

test('configuring email after a failed request allows delivery without a cooldown', async (t) => {
  t.mock.method(console, 'error', () => {});
  const DB = mockLoginDb();
  const env = { DB };
  assert.equal((await worker.fetch(signInRequest(), env)).status, 503);
  assert.equal(DB.token, null);

  env.AUTH_EMAIL_WEBHOOK = 'https://email.example.test/login';
  env.AUTH_EMAIL_WEBHOOK_SECRET = 'test-webhook-secret';
  const delivery = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, env.AUTH_EMAIL_WEBHOOK);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer test-webhook-secret');
    const body = JSON.parse(init.body);
    assert.equal(body.email, 'owner@example.test');
    assert.equal(body.returnTo, '/');
    const loginUrl = new URL(body.loginUrl);
    assert.equal(loginUrl.origin, 'https://app.example.test');
    assert.equal(loginUrl.pathname, '/api/auth/callback');
    const token = loginUrl.searchParams.get('token');
    assert.match(token, /^[a-f0-9]{32}$/);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    assert.equal(DB.token.token_hash, Buffer.from(digest).toString('hex'));
    return new Response(null, { status: 202 });
  });

  const response = await worker.fetch(signInRequest(), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.sent, true);
  assert.equal(payload.loginUrl, undefined);
  assert.equal(delivery.mock.callCount(), 1);

  assert.equal((await worker.fetch(signInRequest(), env)).status, 429);
  assert.equal(delivery.mock.callCount(), 1);
});

test('explicit development link exposure continues to work without an email webhook', async () => {
  const response = await worker.fetch(signInRequest(), {
    DB: mockLoginDb(),
    AUTH_EXPOSE_LOGIN_LINK: '1',
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(new URL(payload.loginUrl).pathname, '/api/auth/callback');
});
