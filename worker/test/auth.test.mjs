import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { base64UrlEncode } from '../src/security.mjs';

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

test('worker email binding sends the login link and ignores a broken webhook', async (t) => {
  t.mock.method(console, 'error', () => {});
  const fetched = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('webhook must not be called');
  });
  const sent = [];
  const response = await worker.fetch(signInRequest(), {
    DB: mockLoginDb(),
    AUTH_EMAIL_WEBHOOK: 'https://your-email-endpoint.example/send-login',
    EMAIL: {
      createMessage(from, to, raw) { return { from, to, raw }; },
      async send(message) { sent.push(message); },
    },
  });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].from, 'noreply@yourcarguy806.com');
  assert.equal(sent[0].to, 'owner@example.test');
  assert.match(sent[0].raw, /https:\/\/app\.example\.test\/api\/auth\/callback\?token=[a-f0-9]{32}/);
  assert.equal(fetched.mock.callCount(), 0);
});

test('failed direct delivery does not start the retry cooldown', async (t) => {
  t.mock.method(console, 'error', () => {});
  let token = null;
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() { return token; },
            async run() {
              if (/DELETE FROM login_tokens/.test(sql)) {
                token = null;
                return;
              }
              assert.match(sql, /INSERT INTO login_tokens/);
              token = { created_at: args[5] };
            },
          };
        },
      };
    },
  };
  const env = {
    DB,
    EMAIL: {
      createMessage(from, to, raw) { return { from, to, raw }; },
      async send() { throw new Error('email routing disabled'); },
    },
  };
  const failed = await worker.fetch(signInRequest(), env);
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).message, /Unable to deliver the sign-in email/);
  assert.equal(token, null);

  env.EMAIL.send = async () => {};
  assert.equal((await worker.fetch(signInRequest(), env)).status, 200);
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

test('magic-link callback refuses to mint a session for a disabled user', async (t) => {
  t.mock.method(console, 'error', () => {});
  const token = 'a'.repeat(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const tokenHash = Buffer.from(digest).toString('hex');
  let insertedSession = false;
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                if (/FROM login_tokens/.test(sql)) {
                  assert.equal(args[0], tokenHash);
                  return {
                    id: 'login-1',
                    email: 'disabled@example.test',
                    return_to: '/app',
                    expires_at: new Date(Date.now() + 60_000).toISOString(),
                    used_at: null,
                  };
                }
                if (/FROM users/.test(sql)) {
                  return {
                    id: 'user-disabled',
                    email: 'disabled@example.test',
                    shop_id: 'shop-1',
                    role: 'technician',
                    name: 'Disabled Tech',
                    enabled: 0,
                  };
                }
                return null;
              },
              async run() {
                assert.fail(`disabled callback must not mutate state: ${sql}`);
              },
            };
          },
        };
      },
      async batch() {
        insertedSession = true;
        assert.fail('disabled callback must not create a session');
      },
    },
  };
  const response = await worker.fetch(
    new Request(`https://app.example.test/api/auth/callback?token=${token}`),
    env,
  );
  assert.equal(response.status, 403);
  assert.match((await response.json()).message, /disabled/i);
  assert.equal(insertedSession, false);
});

test('cookie sessions for disabled users are rejected on API routes', async (t) => {
  t.mock.method(console, 'error', () => {});
  const sessionToken = 'b'.repeat(32);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sessionToken));
  const tokenHash = Buffer.from(digest).toString('hex');
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                assert.match(sql, /u\.enabled = 1/);
                assert.equal(args[0], tokenHash);
                // A disabled user never matches the enabled=1 filter.
                return null;
              },
              async run() {
                assert.fail(`disabled session lookup must not update state: ${sql}`);
              },
              async all() {
                return { results: [] };
              },
            };
          },
        };
      },
    },
  };
  const response = await worker.fetch(new Request('https://app.example.test/api/entities/orders', {
    headers: { Cookie: `mechpro_session=${sessionToken}` },
  }), env);
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /Authentication is required/i);
});

test('Google sign-in validates the ID token and creates a one-time desktop handoff', async (t) => {
  const clientId = 'google-client.apps.googleusercontent.com';
  const keyPair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  publicJwk.kid = 'google-key';
  const env = {
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: 'google-secret',
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                assert.match(sql, /FROM users WHERE email/);
                assert.equal(args[0], 'owner@example.test');
                return {
                  id: 'user-google',
                  email: 'owner@example.test',
                  shop_id: 'shop-google',
                  role: 'admin',
                  name: 'Google Owner',
                  enabled: 1,
                };
              },
              async run() {
                assert.match(sql, /INSERT INTO login_tokens/);
                assert.equal(args[1], 'owner@example.test');
                assert.equal(args[3], '/dispatch');
              },
            };
          },
        };
      },
    },
  };
  const start = await worker.fetch(
    new Request('https://app.example.test/api/auth/google?returnTo=%2Fdispatch&desktop=1'),
    env,
  );
  assert.equal(start.status, 302);
  const authorizationUrl = new URL(start.headers.get('location'));
  assert.equal(authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(authorizationUrl.searchParams.get('client_id'), clientId);
  assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://app.example.test/api/auth/google/callback');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  const state = authorizationUrl.searchParams.get('state');
  const nonce = authorizationUrl.searchParams.get('nonce');
  const cookies = start.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');
  const encode = value => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const header = encode({ alg: 'RS256', kid: publicJwk.kid, typ: 'JWT' });
  const payload = encode({
    iss: 'https://accounts.google.com',
    aud: clientId,
    sub: 'google-subject',
    email: 'owner@example.test',
    email_verified: true,
    name: 'Google Owner',
    nonce,
    iat: Math.floor(Date.now() / 1000) - 5,
    exp: Math.floor(Date.now() / 1000) + 300,
  });
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const idToken = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    requests.push({ url: String(url), init });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(init.body);
      assert.equal(body.get('code'), 'authorization-code');
      assert.equal(body.get('client_secret'), 'google-secret');
      assert.ok(body.get('code_verifier'));
      return Response.json({ id_token: idToken });
    }
    assert.equal(String(url), 'https://www.googleapis.com/oauth2/v3/certs');
    return Response.json({ keys: [publicJwk] });
  });
  const callback = await worker.fetch(new Request(
    `https://app.example.test/api/auth/google/callback?code=authorization-code&state=${encodeURIComponent(state)}`,
    { headers: { Cookie: cookies } },
  ), env);
  assert.equal(callback.status, 302);
  assert.match(callback.headers.get('location'), /^mechpro:\/\/auth\?token=[a-f0-9]{32}$/);
  assert.doesNotMatch(callback.headers.getSetCookie().join('\n'), /mechpro_session=/);
  assert.equal(requests.length, 2);
});

test('Google callback rejects a mismatched OAuth state before token exchange', async (t) => {
  const fetched = t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('invalid state must not be exchanged');
  });
  const response = await worker.fetch(new Request(
    'https://app.example.test/api/auth/google/callback?code=code&state=attacker-state',
    { headers: { Cookie: '__Host-mechpro_google_state=expected; __Host-mechpro_google_nonce=nonce; __Host-mechpro_google_verifier=verifier' } },
  ), {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
  });
  assert.equal(response.status, 401);
  assert.match((await response.json()).message, /invalid or expired/i);
  assert.equal(fetched.mock.callCount(), 0);
});
